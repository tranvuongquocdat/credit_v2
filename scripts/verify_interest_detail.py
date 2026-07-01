#!/usr/bin/env python3
# Correctness gate cho report Chi tiet tien lai (interestDetail).
# - verify_pawn_credit: OLD (ca doi + predicate JS) vs NEW (date-scoped + predicate JS), so multiset key.
# - verify_installment: RPC rpc_installment_interest_detail vs replicate JS cum.
# Read-only. Dung SUPABASE_SERVICE_ROLE_KEY trong credit/.env.local.
import json, subprocess, sys, os, re
from datetime import datetime

ENV = open(os.path.join(os.path.dirname(__file__), '..', '.env.local')).read()
URL = re.search(r'NEXT_PUBLIC_SUPABASE_URL=(\S+)', ENV).group(1)
KEY = re.search(r'SUPABASE_SERVICE_ROLE_KEY=(\S+)', ENV).group(1)

def get(path, params):
    # Phan trang: Supabase cap 1000 dong/request -> loop toi khi het.
    all_rows = []; off = 0; PAGE = 1000
    while True:
        cmd = ["curl","-s","-G",f"{URL}/rest/v1/{path}"]
        for k,v in params.items(): cmd += ["--data-urlencode", f"{k}={v}"]
        cmd += ["-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}",
                "-H","Range-Unit: items","-H",f"Range: {off}-{off+PAGE-1}"]
        out = subprocess.run(cmd, capture_output=True, text=True).stdout
        d = json.loads(out)
        if isinstance(d, dict) and d.get('code'): raise RuntimeError(d)
        all_rows += d
        if len(d) < PAGE: break
        off += PAGE
    return all_rows

def rpc(fn, body):
    out = subprocess.run(["curl","-s","-X","POST",f"{URL}/rest/v1/rpc/{fn}",
      "-H",f"apikey: {KEY}","-H",f"Authorization: Bearer {KEY}",
      "-H","Content-Type: application/json","-d",json.dumps(body)],
      capture_output=True, text=True).stdout
    return json.loads(out)

def pts(s):
    if not s: return None
    return datetime.fromisoformat(s.replace('Z','+00:00'))

def keys_from_rows(rows, start, end):
    # predicate JS: 'orig' neu created in [start,end]; 'cancel' neu is_deleted and updated in [start,end]
    out = set()
    for r in rows:
        ca, ua = pts(r.get('created_at')), pts(r.get('updated_at'))
        if ca and start <= ca <= end: out.add((r['id'], 'orig'))
        if r.get('is_deleted') and ua and start <= ua <= end: out.add((r['id'], 'cancel'))
    return out

def verify_pawn_credit(table, embed, start_iso, end_iso, store_id):
    start, end = pts(start_iso), pts(end_iso)
    mism = 0
    for ttype in ('payment','contract_close','contract_reopen'):
        base = {'select': f'id,created_at,updated_at,is_deleted,{embed}!inner(store_id)',
                f'{embed}.store_id': f'eq.{store_id}', 'transaction_type': f'eq.{ttype}'}
        old = get(table, base)
        new = get(table, {**base,
            'or': f'(and(created_at.gte.{start_iso},created_at.lte.{end_iso}),and(updated_at.gte.{start_iso},updated_at.lte.{end_iso}))'})
        ko, kn = keys_from_rows(old, start, end), keys_from_rows(new, start, end)
        if ko != kn:
            print(f'    {table}/{ttype} LECH: chi-OLD={len(ko-kn)} chi-NEW={len(kn-ko)}'); mism += 1
    return mism == 0

def verify_installment(store_id, start_iso, end_iso):
    start, end = pts(start_iso), pts(end_iso)
    rpc_rows = { r['installment_id']: r for r in rpc('rpc_installment_interest_detail',
        {'p_store_id':store_id,'p_start_date':start_iso,'p_end_date':end_iso}) }
    insts = get('installments_by_store', {'select':'id,down_payment','store_id':f'eq.{store_id}'})
    mism = 0
    for it in insts:
        iid = it['id']; down = it['down_payment'] or 0
        pays = get('installment_history', {'select':'credit_amount,transaction_date',
            'installment_id':f'eq.{iid}','transaction_type':'eq.payment','is_deleted':'eq.false'})
        cs = sum((p['credit_amount'] or 0) for p in pays if p['transaction_date'] and pts(p['transaction_date']) <  start)
        ce = sum((p['credit_amount'] or 0) for p in pays if p['transaction_date'] and pts(p['transaction_date']) <= end)
        i_start, i_end = max(0, cs-down), max(0, ce-down)
        want = (i_end != i_start); got = rpc_rows.get(iid)
        if want and (not got or round(float(got['interest_through_end'])) != round(i_end)):
            print(f'    installment LECH {iid[:8]} want {i_end} got {got}'); mism += 1
        if (not want) and got:
            print(f'    installment THUA {iid[:8]} (RPC co, JS ko)'); mism += 1
    return mism == 0

STORES = [
    ('17bf2ffb-29ee-4e2e-8445-9b030417cf3b','Nam sms'),
    ('e6e318a5-1470-441c-b677-8df6474d2d2f','H1168'),
    ('ce1825b8-645b-4724-9dca-6f3a72a42cd9','Linh sms'),
    ('55a778c4-f60d-4e77-99bc-352423e25e29','CD'),
]
PERIODS = [
    ('2026-07-01T00:00:00+07:00','2026-07-01T23:59:59+07:00','1 ngay'),
    ('2026-06-24T00:00:00+07:00','2026-06-30T23:59:59+07:00','1 tuan'),
    ('2026-06-01T00:00:00+07:00','2026-06-30T23:59:59+07:00','1 thang'),
    ('2025-07-01T00:00:00+07:00','2026-07-01T23:59:59+07:00','ca nam'),
    ('2020-01-01T00:00:00+07:00','2020-01-02T23:59:59+07:00','ky rong'),
]

def run(kinds=('pawn_credit','installment')):
    ok = True
    for sid, name in STORES:
        for s_iso, e_iso, plabel in PERIODS:
            tag = f'{name} / {plabel}'
            if 'pawn_credit' in kinds:
                p = verify_pawn_credit('pawn_history','pawns', s_iso, e_iso, sid)
                c = verify_pawn_credit('credit_history','credits', s_iso, e_iso, sid)
                if not (p and c): ok = False; print(f'  [FAIL] {tag} pawn={p} credit={c}')
                else: print(f'  [ok]   {tag} pawn/credit')
            if 'installment' in kinds:
                i = verify_installment(sid, s_iso, e_iso)
                if not i: ok = False; print(f'  [FAIL] {tag} installment')
                else: print(f'  [ok]   {tag} installment')
    print('\n' + ('OK TAT CA KHOP' if ok else 'FAIL CO LECH'))
    return ok

if __name__ == '__main__':
    kinds = sys.argv[1].split(',') if len(sys.argv) > 1 else ('pawn_credit','installment')
    sys.exit(0 if run(kinds) else 1)
