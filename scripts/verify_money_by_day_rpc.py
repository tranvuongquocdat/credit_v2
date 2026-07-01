#!/usr/bin/env python3
# So rpc_money_by_day_loans_debt(store, today, today) voi dung cong thuc dashboard hom nay.
# Read-only. Dung SUPABASE_SERVICE_ROLE_KEY trong credit/.env.local.
import json, subprocess, sys, datetime, os, re

ENV = open(os.path.join(os.path.dirname(__file__), '..', '.env.local')).read()
URL = re.search(r'NEXT_PUBLIC_SUPABASE_URL=(\S+)', ENV).group(1)
KEY = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', ENV).group(1)
TODAY = datetime.date.today().isoformat()

def curl_get(path, params, rng="0-9999"):
    cmd = ["curl","-s","-G",f"{URL}/rest/v1/{path}"]
    for k,v in params.items(): cmd += ["--data-urlencode", f"{k}={v}"]
    cmd += ["-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}","-H",f"Range: {rng}"]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)

def rpc(fn, body):
    out = subprocess.run(["curl","-s","-X","POST",f"{URL}/rest/v1/rpc/{fn}",
      "-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}",
      "-H","Content-Type: application/json","-d",json.dumps(body)],
      capture_output=True, text=True).stdout
    return json.loads(out)

def verify_store(store_id, label):
    print(f"\n=== {label} ({store_id[:8]}) ===")
    row = rpc("rpc_money_by_day_loans_debt",
              {"p_store_id":store_id,"p_start_date":TODAY,"p_end_date":TODAY})[0]

    # ---- INSTALLMENT dashboard def (today) ----
    inst = curl_get("installments_by_store",
        {"select":"id,installment_amount,down_payment,status_code","store_id":f"eq.{store_id}",
         "status_code":"in.(ON_TIME,OVERDUE,LATE_INTEREST)"})
    iids = [r["id"] for r in inst]
    paid = {}; debt = {}
    for i in range(0,len(iids),400):
        b=iids[i:i+400]
        for r in rpc("installment_get_paid_amount",{"p_installment_ids":b}): paid[r["installment_id"]]=float(r["paid_amount"])
        for r in rpc("get_installment_old_debt",{"p_installment_ids":b}):     debt[r["installment_id"]]=float(r["old_debt"])
    dash_iloan = sum((r["installment_amount"] or 0) - paid.get(r["id"],0) for r in inst)
    dash_idebt = sum(debt.get(r["id"],0) for r in inst)

    # ---- CREDIT dashboard def (today) ----
    cr = curl_get("credits", {"select":"id","store_id":f"eq.{store_id}","status":"not.in.(closed,deleted)"})
    cids=[r["id"] for r in cr]; cloan=0.0; cdebt=0.0
    for i in range(0,len(cids),400):
        b=cids[i:i+400]
        for r in rpc("get_current_principal",{"p_credit_ids":b}): cloan+=float(r["current_principal"])
        for r in rpc("get_old_debt",{"p_credit_ids":b}):          cdebt+=float(r["old_debt"])

    # ---- PAWN dashboard def (today) ----
    pw = curl_get("pawns", {"select":"id","store_id":f"eq.{store_id}","status":"not.in.(closed,deleted)"})
    pids=[r["id"] for r in pw]; ploan=0.0; pdebt=0.0
    for i in range(0,len(pids),400):
        b=pids[i:i+400]
        for r in rpc("get_pawn_current_principal",{"p_pawn_ids":b}): ploan+=float(r["current_principal"])
        for r in rpc("get_pawn_old_debt",{"p_pawn_ids":b}):          pdebt+=float(r["old_debt"])

    checks = [
        ("installment_loan", float(row["installment_loan"]), dash_iloan),
        ("installment_debt", float(row["installment_debt"]), dash_idebt),
        ("credit_loan",      float(row["credit_loan"]),      cloan),
        ("credit_debt",      float(row["credit_debt"]),      cdebt),
        ("pawn_loan",        float(row["pawn_loan"]),        ploan),
        ("pawn_debt",        float(row["pawn_debt"]),        pdebt),
    ]
    ok=True
    for name, rpc_v, dash_v in checks:
        diff = round(rpc_v - dash_v)
        flag = "OK" if diff==0 else "*** LECH ***"
        if diff!=0: ok=False
        print(f"  {name:18} RPC={rpc_v:>16,.0f}  dashboard={dash_v:>16,.0f}  diff={diff:>12,}  {flag}")
    return ok

def spot_check_closed():
    # HD tra gop da dong: ngay TRUOC khi dong con cho vay > 0; SAU khi dong = 0 (roi khoi tong store).
    STORE="17bf2ffb-29ee-4e2e-8445-9b030417cf3b"
    closed = curl_get("installments_by_store",
        {"select":"id","store_id":f"eq.{STORE}","status_code":"eq.CLOSED","limit":"1"})[0]["id"]
    ev = curl_get("installment_history",
        {"select":"created_at","installment_id":f"eq.{closed}","transaction_type":"eq.contract_close",
         "is_deleted":"eq.false","order":"created_at.desc","limit":"1"})[0]["created_at"][:10]
    close_d = datetime.date.fromisoformat(ev)
    before = (close_d - datetime.timedelta(days=1)).isoformat()
    after  = (close_d + datetime.timedelta(days=1)).isoformat()
    rb = rpc("rpc_money_by_day_loans_debt",{"p_store_id":STORE,"p_start_date":before,"p_end_date":after})
    print("\n=== spot-check HD dong (created_at contract_close =", ev, ") ===")
    for r in rb: print(f"  {r['as_of_date']} installment_loan={float(r['installment_loan']):,.0f}")
    print("  -> ky vong: loan khong tang bat thuong quanh ngay dong")

def spot_check_reopen():
    r = curl_get("installment_history",
        {"select":"installment_id,created_at","transaction_type":"eq.contract_reopen","is_deleted":"eq.false","limit":"1"})[0]
    print("\n=== spot-check reopen: HD", r["installment_id"][:8], "reopen", r["created_at"][:10], "===")
    print("  -> xac nhan HD nay con cho vay sau ngay reopen (khong bi coi la dong)")

if __name__ == "__main__":
    stores = [
        ("17bf2ffb-29ee-4e2e-8445-9b030417cf3b", "Nam sms (tra gop)"),
        ("e6e318a5-1470-441c-b677-8df6474d2d2f", "H1168 (tin dung)"),
        ("ce1825b8-645b-4724-9dca-6f3a72a42cd9", "Linh sms"),
    ]
    all_ok = all(verify_store(s,l) for s,l in stores)
    print("\n" + ("OK TAT CA KHOP - cong chan PASS" if all_ok else "FAIL CO LECH - sua RPC truoc khi di tiep"))
    sys.exit(0 if all_ok else 1)
