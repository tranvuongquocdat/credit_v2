export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      collaterals: {
        Row: {
          attr_01: string | null
          attr_02: string | null
          attr_03: string | null
          attr_04: string | null
          attr_05: string | null
          category: string
          code: string
          created_at: string | null
          default_amount: number
          id: string
          interest_per_day: number
          interest_period: number
          interest_type: string
          liquidation_after: number | null
          name: string
          prepay_interest: boolean | null
          status: string
          store_id: string
          updated_at: string | null
        }
        Insert: {
          attr_01?: string | null
          attr_02?: string | null
          attr_03?: string | null
          attr_04?: string | null
          attr_05?: string | null
          category: string
          code: string
          created_at?: string | null
          default_amount: number
          id?: string
          interest_per_day: number
          interest_period: number
          interest_type: string
          liquidation_after?: number | null
          name: string
          prepay_interest?: boolean | null
          status?: string
          store_id: string
          updated_at?: string | null
        }
        Update: {
          attr_01?: string | null
          attr_02?: string | null
          attr_03?: string | null
          attr_04?: string | null
          attr_05?: string | null
          category?: string
          code?: string
          created_at?: string | null
          default_amount?: number
          id?: string
          interest_per_day?: number
          interest_period?: number
          interest_type?: string
          liquidation_after?: number | null
          name?: string
          prepay_interest?: boolean | null
          status?: string
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaterals_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_extension_histories: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_id: string
          days: number
          from_date: string
          id: string
          notes: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_id: string
          days: number
          from_date: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_id?: string
          days?: number
          from_date?: string
          id?: string
          notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_extension_histories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extensions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "extensions_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits_by_store"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_history: {
        Row: {
          created_at: string
          created_by: string | null
          credit_amount: number | null
          credit_id: string
          date_status: string | null
          debit_amount: number | null
          description: string | null
          effective_date: string | null
          id: string
          is_created_from_contract_closure: boolean | null
          is_deleted: boolean
          principal_change_description: string | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          credit_id: string
          date_status?: string | null
          debit_amount?: number | null
          description?: string | null
          effective_date?: string | null
          id?: string
          is_created_from_contract_closure?: boolean | null
          is_deleted?: boolean
          principal_change_description?: string | null
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          credit_id?: string
          date_status?: string | null
          debit_amount?: number | null
          description?: string | null
          effective_date?: string | null
          id?: string
          is_created_from_contract_closure?: boolean | null
          is_deleted?: boolean
          principal_change_description?: string | null
          transaction_type?: Database["public"]["Enums"]["credit_transaction_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_amount_history_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_amount_history_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits_by_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_history_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      credits: {
        Row: {
          collateral: string | null
          contract_code: string | null
          created_at: string | null
          customer_id: string
          debt_amount: number | null
          id: string
          interest_notation: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_ui_type: string | null
          interest_value: number
          loan_amount: number
          loan_date: string
          loan_period: number
          notes: string | null
          status: Database["public"]["Enums"]["credit_status"] | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          collateral?: string | null
          contract_code?: string | null
          created_at?: string | null
          customer_id: string
          debt_amount?: number | null
          id?: string
          interest_notation?: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_ui_type?: string | null
          interest_value: number
          loan_amount: number
          loan_date: string
          loan_period: number
          notes?: string | null
          status?: Database["public"]["Enums"]["credit_status"] | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          collateral?: string | null
          contract_code?: string | null
          created_at?: string | null
          customer_id?: string
          debt_amount?: number | null
          id?: string
          interest_notation?: string | null
          interest_period?: number
          interest_type?: Database["public"]["Enums"]["interest_type"]
          interest_ui_type?: string | null
          interest_value?: number
          loan_amount?: number
          loan_date?: string
          loan_period?: number
          notes?: string | null
          status?: Database["public"]["Enums"]["credit_status"] | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          blacklist_reason: string | null
          created_at: string | null
          id: string
          id_number: string | null
          name: string
          phone: string | null
          store_id: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          blacklist_reason?: string | null
          created_at?: string | null
          id?: string
          id_number?: string | null
          name: string
          phone?: string | null
          store_id?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          blacklist_reason?: string | null
          created_at?: string | null
          id?: string
          id_number?: string | null
          name?: string
          phone?: string | null
          store_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          employee_id: string
          granted_at: string | null
          granted_by: string | null
          id: string
          permission_id: string
        }
        Insert: {
          employee_id: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id: string
        }
        Update: {
          employee_id?: string
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          permission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string
          id: string
          phone: string | null
          status: string | null
          store_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name: string
          id: string
          phone?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_amount: number
          date_status: string | null
          debit_amount: number
          description: string | null
          effective_date: string | null
          id: string
          installment_id: string
          is_created_from_contract_closure: boolean
          is_deleted: boolean
          transaction_date: string | null
          transaction_type: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number
          date_status?: string | null
          debit_amount?: number
          description?: string | null
          effective_date?: string | null
          id?: string
          installment_id: string
          is_created_from_contract_closure?: boolean
          is_deleted?: boolean
          transaction_date?: string | null
          transaction_type: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number
          date_status?: string | null
          debit_amount?: number
          description?: string | null
          effective_date?: string | null
          id?: string
          installment_id?: string
          is_created_from_contract_closure?: boolean
          is_deleted?: boolean
          transaction_date?: string | null
          transaction_type?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_history_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_history_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments_by_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_history_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      installments: {
        Row: {
          contract_code: string | null
          created_at: string | null
          customer_id: string
          debt_amount: number
          document: string | null
          down_payment: number
          employee_id: string
          id: string
          installment_amount: number
          loan_date: string
          loan_period: number
          notes: string | null
          payment_due_date: string | null
          payment_period: number
          status: Database["public"]["Enums"]["installment_status"] | null
          updated_at: string | null
        }
        Insert: {
          contract_code?: string | null
          created_at?: string | null
          customer_id: string
          debt_amount?: number
          document?: string | null
          down_payment: number
          employee_id: string
          id?: string
          installment_amount: number
          loan_date: string
          loan_period: number
          notes?: string | null
          payment_due_date?: string | null
          payment_period: number
          status?: Database["public"]["Enums"]["installment_status"] | null
          updated_at?: string | null
        }
        Update: {
          contract_code?: string | null
          created_at?: string | null
          customer_id?: string
          debt_amount?: number
          document?: string | null
          down_payment?: number
          employee_id?: string
          id?: string
          installment_amount?: number
          loan_date?: string
          loan_period?: number
          notes?: string | null
          payment_due_date?: string | null
          payment_period?: number
          status?: Database["public"]["Enums"]["installment_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pawn_history: {
        Row: {
          created_at: string
          created_by: string | null
          credit_amount: number | null
          date_status: string | null
          debit_amount: number | null
          description: string | null
          effective_date: string | null
          id: string
          is_created_from_contract_closure: boolean | null
          is_deleted: boolean
          pawn_id: string
          principal_change_description: string | null
          transaction_type: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          date_status?: string | null
          debit_amount?: number | null
          description?: string | null
          effective_date?: string | null
          id?: string
          is_created_from_contract_closure?: boolean | null
          is_deleted?: boolean
          pawn_id: string
          principal_change_description?: string | null
          transaction_type: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credit_amount?: number | null
          date_status?: string | null
          debit_amount?: number | null
          description?: string | null
          effective_date?: string | null
          id?: string
          is_created_from_contract_closure?: boolean | null
          is_deleted?: boolean
          pawn_id?: string
          principal_change_description?: string | null
          transaction_type?: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pawn_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawn_history_pawn_id_fkey"
            columns: ["pawn_id"]
            isOneToOne: false
            referencedRelation: "pawns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawn_history_pawn_id_fkey"
            columns: ["pawn_id"]
            isOneToOne: false
            referencedRelation: "pawns_by_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawn_history_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pawns: {
        Row: {
          collateral_detail: Json | null
          collateral_id: string
          contract_code: string | null
          created_at: string | null
          customer_id: string
          debt_amount: number
          id: string
          interest_notation: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_ui_type: string | null
          interest_value: number
          is_advance_payment: boolean
          loan_amount: number
          loan_date: string
          loan_period: number
          notes: string | null
          status: Database["public"]["Enums"]["pawn_status"] | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          collateral_detail?: Json | null
          collateral_id: string
          contract_code?: string | null
          created_at?: string | null
          customer_id: string
          debt_amount?: number
          id?: string
          interest_notation?: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_ui_type?: string | null
          interest_value: number
          is_advance_payment?: boolean
          loan_amount: number
          loan_date: string
          loan_period: number
          notes?: string | null
          status?: Database["public"]["Enums"]["pawn_status"] | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          collateral_detail?: Json | null
          collateral_id?: string
          contract_code?: string | null
          created_at?: string | null
          customer_id?: string
          debt_amount?: number
          id?: string
          interest_notation?: string | null
          interest_period?: number
          interest_type?: Database["public"]["Enums"]["interest_type"]
          interest_ui_type?: string | null
          interest_value?: number
          is_advance_payment?: boolean
          loan_amount?: number
          loan_date?: string
          loan_period?: number
          notes?: string | null
          status?: Database["public"]["Enums"]["pawn_status"] | null
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pawns_collateral_id_fkey"
            columns: ["collateral_id"]
            isOneToOne: false
            referencedRelation: "collaterals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          is_banned: boolean | null
          is_banned_by_superadmin: boolean
          role: string
          updated_at: string | null
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean | null
          is_banned_by_superadmin?: boolean
          role?: string
          updated_at?: string | null
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean | null
          is_banned_by_superadmin?: boolean
          role?: string
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      store_fund_history: {
        Row: {
          created_at: string | null
          fund_amount: number
          id: string
          name: string | null
          note: string | null
          store_id: string
          transaction_type: string | null
        }
        Insert: {
          created_at?: string | null
          fund_amount: number
          id?: string
          name?: string | null
          note?: string | null
          store_id: string
          transaction_type?: string | null
        }
        Update: {
          created_at?: string | null
          fund_amount?: number
          id?: string
          name?: string | null
          note?: string | null
          store_id?: string
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_fund_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_total_fund: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean
          store_id: string
          total_fund: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          store_id: string
          total_fund: number
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean
          store_id?: string
          total_fund?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_total_fund_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          actual_interest: number
          address: string
          cash_fund: number
          created_at: string
          created_by: string | null
          credit_money: number
          expected_interest: number
          id: string
          installment_money: number
          investment: number
          is_deleted: boolean
          name: string
          pawn_money: number
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          actual_interest?: number
          address: string
          cash_fund?: number
          created_at?: string
          created_by?: string | null
          credit_money?: number
          expected_interest?: number
          id?: string
          installment_money?: number
          investment?: number
          is_deleted?: boolean
          name: string
          pawn_money?: number
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          actual_interest?: number
          address?: string
          cash_fund?: number
          created_at?: string
          created_by?: string | null
          credit_money?: number
          expected_interest?: number
          id?: string
          installment_money?: number
          investment?: number
          is_deleted?: boolean
          name?: string
          pawn_money?: number
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          key: string
          updated_at: string | null
          updated_by: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string | null
          updated_by: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string | null
          updated_by?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          created_at: string
          credit_amount: number | null
          customer_id: string | null
          debit_amount: number | null
          description: string | null
          employee_id: string | null
          employee_name: string | null
          id: string
          is_deleted: boolean
          store_id: string
          transaction_type: string | null
          update_at: string | null
        }
        Insert: {
          created_at?: string
          credit_amount?: number | null
          customer_id?: string | null
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          is_deleted?: boolean
          store_id: string
          transaction_type?: string | null
          update_at?: string | null
        }
        Update: {
          created_at?: string
          credit_amount?: number | null
          customer_id?: string | null
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          employee_name?: string | null
          id?: string
          is_deleted?: boolean
          store_id?: string
          transaction_type?: string | null
          update_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_employee_name_fkey"
            columns: ["employee_name"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["username"]
          },
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      credits_by_store: {
        Row: {
          collateral: string | null
          contract_code: string | null
          created_at: string | null
          customer_id: string | null
          debt_amount: number | null
          has_paid: boolean | null
          id: string | null
          interest_notation: string | null
          interest_period: number | null
          interest_type: Database["public"]["Enums"]["interest_type"] | null
          interest_ui_type: string | null
          interest_value: number | null
          is_completed: boolean | null
          loan_amount: number | null
          loan_date: string | null
          loan_period: number | null
          next_payment_date: string | null
          notes: string | null
          status: Database["public"]["Enums"]["credit_status"] | null
          status_code: string | null
          store_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      installments_by_store: {
        Row: {
          contract_code: string | null
          created_at: string | null
          customer_id: string | null
          debt_amount: number | null
          document: string | null
          down_payment: number | null
          employee_id: string | null
          id: string | null
          installment_amount: number | null
          loan_date: string | null
          loan_period: number | null
          notes: string | null
          payment_due_date: string | null
          payment_period: number | null
          status: Database["public"]["Enums"]["installment_status"] | null
          status_code: string | null
          store_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      pawns_by_store: {
        Row: {
          collateral_detail: Json | null
          collateral_id: string | null
          contract_code: string | null
          created_at: string | null
          customer_id: string | null
          debt_amount: number | null
          has_paid: boolean | null
          id: string | null
          interest_notation: string | null
          interest_period: number | null
          interest_type: Database["public"]["Enums"]["interest_type"] | null
          interest_ui_type: string | null
          interest_value: number | null
          is_advance_payment: boolean | null
          is_completed: boolean | null
          loan_amount: number | null
          loan_date: string | null
          loan_period: number | null
          next_payment_date: string | null
          notes: string | null
          status: Database["public"]["Enums"]["pawn_status"] | null
          status_code: string | null
          store_id: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pawns_collateral_id_fkey"
            columns: ["collateral_id"]
            isOneToOne: false
            referencedRelation: "collaterals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawns_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calc_cash_fund_as_of: {
        Args: { p_as_of?: string; p_store_id: string }
        Returns: number
      }
      calc_cash_fund_from_all_sources: {
        Args: { p_store_id: string }
        Returns: {
          credit_total: number
          fund_total: number
          grand_total: number
          installment_total: number
          pawn_total: number
          transaction_total: number
        }[]
      }
      calc_cash_fund_series: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          as_of_date: string
          fund_total: number
        }[]
      }
      calc_expected_until: {
        Args: { p_credit_id: string; p_end_date: string }
        Returns: number
      }
      calc_interest_segment: {
        Args: {
          p_daily_rate: number
          p_end: string
          p_principal: number
          p_start: string
        }
        Returns: number
      }
      calc_pawn_expected_until: {
        Args: { p_end_date: string; p_pawn_id: string }
        Returns: number
      }
      calc_pawn_pawn_interest_segment: {
        Args: {
          p_daily_rate: number
          p_end: string
          p_principal: number
          p_start: string
        }
        Returns: number
      }
      credit_get_totals: {
        Args: { p_filters?: Json; p_store_id: string }
        Returns: {
          total_interest_today: number
          total_loan_amount: number
          total_old_debt: number
          total_paid_interest: number
        }[]
      }
      get_credit_financial_summary: {
        Args: {
          p_active_credit_ids: string[]
          p_all_credit_ids: string[]
          p_end_date: string
          p_start_date: string
        }
        Returns: Json
      }
      get_credit_statuses: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          status_code: string
        }[]
      }
      get_credits_with_latest_payments: {
        Args: { store_id: string }
        Returns: {
          credit_id: string
          interest_period: number
          latest_payment_date: string
          loan_date: string
          loan_period: number
        }[]
      }
      get_current_principal: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          current_principal: number
        }[]
      }
      get_dashboard_chart_metrics: {
        Args: { p_from_month: string; p_store_id: string; p_to_month: string }
        Returns: {
          cho_vay: number
          cho_vay_credit: number
          cho_vay_installment: number
          cho_vay_pawn: number
          loi_nhuan: number
          loi_nhuan_credit: number
          loi_nhuan_installment: number
          loi_nhuan_pawn: number
          month_bucket: string
        }[]
      }
      get_expected_interest: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          expected_profit: number
          interest_today: number
        }[]
      }
      get_installment_interest_for_date_range: {
        Args: {
          p_end_date: string
          p_installment_ids: string[]
          p_start_date: string
        }
        Returns: {
          installment_id: string
          interest_collected: number
        }[]
      }
      get_installment_old_debt: {
        Args: { p_installment_ids: string[] }
        Returns: {
          installment_id: string
          old_debt: number
        }[]
      }
      get_installment_statuses: {
        Args: { p_installment_ids: string[] }
        Returns: {
          description: string
          installment_id: string
          status: string
          status_code: string
        }[]
      }
      get_latest_installment_payment_paid_dates: {
        Args: { p_installment_ids: string[] }
        Returns: {
          installment_id: string
          latest_paid_date: string
        }[]
      }
      get_latest_payment_paid_dates: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          latest_paid_date: string
        }[]
      }
      get_next_payment_info: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          has_paid: boolean
          is_completed: boolean
          next_date: string
        }[]
      }
      get_old_debt: {
        Args: { p_credit_ids: string[] }
        Returns: {
          credit_id: string
          old_debt: number
        }[]
      }
      get_paid_interest: {
        Args: {
          p_credit_ids: string[]
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          credit_id: string
          paid_interest: number
        }[]
      }
      get_pawn_current_principal: {
        Args: { p_pawn_ids: string[] }
        Returns: {
          current_principal: number
          pawn_id: string
        }[]
      }
      get_pawn_expected_interest: {
        Args: { p_pawn_ids: string[] }
        Returns: {
          expected_profit: number
          interest_today: number
          pawn_id: string
        }[]
      }
      get_pawn_next_payment_info: {
        Args: { p_pawn_ids: string[] }
        Returns: {
          has_paid: boolean
          is_completed: boolean
          next_date: string
          pawn_id: string
        }[]
      }
      get_pawn_old_debt: {
        Args: { p_pawn_ids: string[] }
        Returns: {
          old_debt: number
          pawn_id: string
        }[]
      }
      get_pawn_paid_interest: {
        Args: {
          p_end_date?: string
          p_pawn_ids: string[]
          p_start_date?: string
        }
        Returns: {
          paid_interest: number
          pawn_id: string
        }[]
      }
      get_pawn_statuses: {
        Args: { p_pawn_ids: string[] }
        Returns: {
          pawn_id: string
          status_code: string
        }[]
      }
      get_pawns_with_latest_payments: {
        Args: { store_id: string }
        Returns: {
          interest_period: number
          latest_payment_date: string
          loan_date: string
          loan_period: number
          pawn_id: string
        }[]
      }
      get_store_transactions_for_date: {
        Args: { p_date: string; p_store_id: string }
        Returns: number
      }
      installment_get_collected_profit: {
        Args: { p_installment_ids: string[] }
        Returns: {
          installment_id: string
          profit_collected: number
        }[]
      }
      installment_get_paid_amount: {
        Args: { p_installment_ids: string[] }
        Returns: {
          installment_id: string
          paid_amount: number
        }[]
      }
      installment_get_totals: {
        Args: { p_filters?: Json; p_store_id: string }
        Returns: {
          total_amount_given: number
          total_daily_amount: number
          total_debt: number
          total_paid: number
          total_remaining: number
        }[]
      }
      installment_next_unpaid_date: {
        Args: { p_installment_ids: string[] }
        Returns: {
          installment_id: string
          next_unpaid_date: string
        }[]
      }
      installment_overdue_stats: {
        Args: { p_installment_ids: string[] }
        Returns: {
          first_unpaid: string
          installment_id: string
          last_check: string
          late_periods: number
        }[]
      }
      pawn_get_totals: {
        Args: { p_filters?: Json; p_store_id: string }
        Returns: {
          total_interest_today: number
          total_loan_amount: number
          total_old_debt: number
          total_paid_interest: number
        }[]
      }
      recalibrate_store_cash_fund: {
        Args: { p_store_id: string }
        Returns: number
      }
      rpc_credit_history_grouped: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          cancel_date: string
          contract_code: string
          credit_amount: number
          customer_name: string
          debit_amount: number
          employee_name: string
          group_ts: string
          is_deleted: boolean
          transaction_date: string
          transaction_type: string
        }[]
      }
      rpc_installment_history_grouped: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          cancel_date: string
          contract_code: string
          credit_amount: number
          customer_name: string
          debit_amount: number
          employee_name: string
          group_ts: string
          is_deleted: boolean
          transaction_date: string
          transaction_type: string
        }[]
      }
      rpc_money_by_day_series: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          as_of_date: string
          credit_activity: number
          fund_activity: number
          fund_total: number
          installment_activity: number
          pawn_activity: number
          transaction_activity: number
        }[]
      }
      rpc_pawn_history_grouped: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          cancel_date: string
          contract_code: string
          credit_amount: number
          customer_name: string
          debit_amount: number
          employee_name: string
          group_ts: string
          is_deleted: boolean
          item_name: string
          transaction_date: string
          transaction_type: string
        }[]
      }
      rpc_store_fund_history_grouped: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          customer_name: string
          fund_amount: number
          group_ts: string
          transaction_date: string
          transaction_type: string
        }[]
      }
      rpc_transactions_grouped: {
        Args: { p_end_date: string; p_start_date: string; p_store_id: string }
        Returns: {
          cancel_date: string
          credit_amount: number
          customer_name: string
          debit_amount: number
          employee_name: string
          group_ts: string
          is_deleted: boolean
          transaction_date: string
          transaction_type: string
        }[]
      }
      search_credits_unaccent: {
        Args: {
          p_contract_code?: string
          p_customer_name?: string
          p_duration?: number
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_start_date?: string
          p_status?: string
          p_store_id?: string
        }
        Returns: {
          collateral: string
          contract_code: string
          created_at: string
          customer_address: string
          customer_id: string
          customer_id_number: string
          customer_name: string
          customer_phone: string
          debt_amount: number
          has_paid: boolean
          id: string
          interest_notation: string
          interest_period: number
          interest_type: string
          interest_ui_type: string
          interest_value: number
          is_completed: boolean
          loan_amount: number
          loan_date: string
          loan_period: number
          next_payment_date: string
          notes: string
          status: Database["public"]["Enums"]["credit_status"]
          status_code: string
          store_id: string
          updated_at: string
        }[]
      }
      search_installments_unaccent: {
        Args: {
          p_contract_code?: string
          p_customer_name?: string
          p_duration?: number
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_start_date?: string
          p_status?: string
          p_store_id?: string
        }
        Returns: {
          contract_code: string
          created_at: string
          customer_address: string
          customer_id: string
          customer_id_number: string
          customer_name: string
          customer_phone: string
          document: string
          down_payment: number
          employee_id: string
          id: string
          installment_amount: number
          loan_date: string
          loan_period: number
          notes: string
          payment_due_date: string
          payment_period: number
          status: Database["public"]["Enums"]["installment_status"]
          status_code: string
          store_id: string
          updated_at: string
        }[]
      }
      search_pawns_unaccent: {
        Args: {
          p_contract_code?: string
          p_customer_name?: string
          p_duration?: number
          p_end_date?: string
          p_limit?: number
          p_offset?: number
          p_start_date?: string
          p_status?: string
          p_store_id?: string
        }
        Returns: {
          contract_code: string
          created_at: string
          customer_address: string
          customer_id: string
          customer_id_number: string
          customer_name: string
          customer_phone: string
          debt_amount: number
          has_paid: boolean
          id: string
          interest_notation: string
          interest_period: number
          interest_type: string
          interest_ui_type: string
          interest_value: number
          is_completed: boolean
          loan_amount: number
          loan_date: string
          loan_period: number
          next_payment_date: string
          notes: string
          status: Database["public"]["Enums"]["pawn_status"]
          status_code: string
          store_id: string
          updated_at: string
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
    }
    Enums: {
      credit_status:
        | "on_time"
        | "overdue"
        | "late_interest"
        | "bad_debt"
        | "closed"
        | "deleted"
      credit_transaction_type:
        | "principal_repayment"
        | "additional_loan"
        | "initial_loan"
        | "payment"
        | "payment_cancel"
        | "contract_close"
        | "contract_reopen"
        | "cancel_additional_loan"
        | "cancel_principal_repayment"
        | "contract_extension"
        | "contract_delete"
        | "debt_payment"
        | "update_contract"
      installment_payment_status:
        | "pending"
        | "paid"
        | "partial"
        | "overdue"
        | "cancelled"
      installment_status:
        | "on_time"
        | "overdue"
        | "late_interest"
        | "bad_debt"
        | "closed"
        | "deleted"
        | "finished"
      installment_transaction_type:
        | "payment"
        | "payment_cancel"
        | "contract_close"
        | "contract_reopen"
        | "initial_loan"
        | "contract_delete"
      interest_type: "percentage" | "fixed_amount"
      pawn_status:
        | "on_time"
        | "overdue"
        | "late_interest"
        | "bad_debt"
        | "closed"
        | "deleted"
      pawn_transaction_type:
        | "payment"
        | "initial_loan"
        | "principal_repayment"
        | "contract_close"
        | "additional_loan"
        | "payment_cancel"
        | "contract_reopen"
        | "cancel_additional_loan"
        | "cancel_principal_repayment"
        | "contract_delete"
        | "debt_payment"
        | "contract_close_adjustment"
        | "update_contract"
      payment_period_status: "pending" | "paid" | "overdue" | "partially_paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      credit_status: [
        "on_time",
        "overdue",
        "late_interest",
        "bad_debt",
        "closed",
        "deleted",
      ],
      credit_transaction_type: [
        "principal_repayment",
        "additional_loan",
        "initial_loan",
        "payment",
        "payment_cancel",
        "contract_close",
        "contract_reopen",
        "cancel_additional_loan",
        "cancel_principal_repayment",
        "contract_extension",
        "contract_delete",
        "debt_payment",
        "update_contract",
      ],
      installment_payment_status: [
        "pending",
        "paid",
        "partial",
        "overdue",
        "cancelled",
      ],
      installment_status: [
        "on_time",
        "overdue",
        "late_interest",
        "bad_debt",
        "closed",
        "deleted",
        "finished",
      ],
      installment_transaction_type: [
        "payment",
        "payment_cancel",
        "contract_close",
        "contract_reopen",
        "initial_loan",
        "contract_delete",
      ],
      interest_type: ["percentage", "fixed_amount"],
      pawn_status: [
        "on_time",
        "overdue",
        "late_interest",
        "bad_debt",
        "closed",
        "deleted",
      ],
      pawn_transaction_type: [
        "payment",
        "initial_loan",
        "principal_repayment",
        "contract_close",
        "additional_loan",
        "payment_cancel",
        "contract_reopen",
        "cancel_additional_loan",
        "cancel_principal_repayment",
        "contract_delete",
        "debt_payment",
        "contract_close_adjustment",
        "update_contract",
      ],
      payment_period_status: ["pending", "paid", "overdue", "partially_paid"],
    },
  },
} as const
