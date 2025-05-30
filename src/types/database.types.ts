export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      credit_amount_history: {
        Row: {
          amount: number
          created_at: string
          credit_id: string
          id: string
          note: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          credit_id: string
          id?: string
          note?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          credit_id?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_amount_history_credit_id_fkey1"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
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
        ]
      }
      credit_history: {
        Row: {
          created_at: string
          credit_amount: number | null
          credit_id: string
          debit_amount: number | null
          description: string | null
          employee_id: string | null
          id: string
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Insert: {
          created_at?: string
          credit_amount?: number | null
          credit_id: string
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          id?: string
          transaction_type: Database["public"]["Enums"]["credit_transaction_type"]
        }
        Update: {
          created_at?: string
          credit_amount?: number | null
          credit_id?: string
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          id?: string
          transaction_type?: Database["public"]["Enums"]["credit_transaction_type"]
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
            foreignKeyName: "credit_amount_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_payment_periods: {
        Row: {
          actual_amount: number
          created_at: string | null
          credit_id: string
          end_date: string
          expected_amount: number
          id: string
          notes: string | null
          other_amount: number | null
          payment_date: string | null
          period_number: number
          start_date: string
          updated_at: string | null
        }
        Insert: {
          actual_amount?: number
          created_at?: string | null
          credit_id: string
          end_date: string
          expected_amount: number
          id?: string
          notes?: string | null
          other_amount?: number | null
          payment_date?: string | null
          period_number: number
          start_date: string
          updated_at?: string | null
        }
        Update: {
          actual_amount?: number
          created_at?: string | null
          credit_id?: string
          end_date?: string
          expected_amount?: number
          id?: string
          notes?: string | null
          other_amount?: number | null
          payment_date?: string | null
          period_number?: number
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_payment_periods_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "credits"
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
          permission_id: string
        }
        Insert: {
          employee_id: string
          granted_at?: string | null
          granted_by?: string | null
          permission_id: string
        }
        Update: {
          employee_id?: string
          granted_at?: string | null
          granted_by?: string | null
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
          {
            foreignKeyName: "employee_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
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
          credit_amount: number | null
          debit_amount: number | null
          description: string | null
          employee_id: string | null
          id: number
          installment_id: string
          transaction_type: string
        }
        Insert: {
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          id?: number
          installment_id: string
          transaction_type: string
        }
        Update: {
          created_at?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          description?: string | null
          employee_id?: string | null
          id?: number
          installment_id?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "installment_amount_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_amount_history_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_amount_history_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments_by_store"
            referencedColumns: ["id"]
          },
        ]
      }
      installment_payment_period: {
        Row: {
          actual_amount: number | null
          created_at: string | null
          date: string
          expected_amount: number
          id: string
          installment_id: string
          notes: string | null
          payment_end_date: string | null
          payment_start_date: string | null
          period_number: number
          updated_at: string | null
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string | null
          date: string
          expected_amount: number
          id?: string
          installment_id: string
          notes?: string | null
          payment_end_date?: string | null
          payment_start_date?: string | null
          period_number: number
          updated_at?: string | null
        }
        Update: {
          actual_amount?: number | null
          created_at?: string | null
          date?: string
          expected_amount?: number
          id?: string
          installment_id?: string
          notes?: string | null
          payment_end_date?: string | null
          payment_start_date?: string | null
          period_number?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "installment_payment_period_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installment_payment_period_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "installments_by_store"
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
      pawn_amount_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          pawn_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          pawn_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          pawn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pawn_amount_history_pawn_id_fkey1"
            columns: ["pawn_id"]
            isOneToOne: false
            referencedRelation: "pawns"
            referencedColumns: ["id"]
          },
        ]
      }
      pawn_history: {
        Row: {
          created_at: string | null
          created_by: string | null
          credit_amount: number | null
          debit_amount: number | null
          employee_id: string | null
          id: string
          notes: string | null
          pawn_id: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          pawn_id: string
          transaction_date: string
          transaction_type: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          credit_amount?: number | null
          debit_amount?: number | null
          employee_id?: string | null
          id?: string
          notes?: string | null
          pawn_id?: string
          transaction_date?: string
          transaction_type?: Database["public"]["Enums"]["pawn_transaction_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pawn_amount_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawn_amount_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pawn_amount_history_pawn_id_fkey"
            columns: ["pawn_id"]
            isOneToOne: false
            referencedRelation: "pawns"
            referencedColumns: ["id"]
          },
        ]
      }
      pawn_payment_periods: {
        Row: {
          actual_amount: number | null
          created_at: string | null
          end_date: string
          expected_amount: number
          id: string
          notes: string | null
          other_amount: number | null
          pawn_id: string
          payment_date: string | null
          period_number: number
          start_date: string
          updated_at: string | null
        }
        Insert: {
          actual_amount?: number | null
          created_at?: string | null
          end_date: string
          expected_amount: number
          id?: string
          notes?: string | null
          other_amount?: number | null
          pawn_id: string
          payment_date?: string | null
          period_number: number
          start_date: string
          updated_at?: string | null
        }
        Update: {
          actual_amount?: number | null
          created_at?: string | null
          end_date?: string
          expected_amount?: number
          id?: string
          notes?: string | null
          other_amount?: number | null
          pawn_id?: string
          payment_date?: string | null
          period_number?: number
          start_date?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pawn_payment_periods_pawn_id_fkey"
            columns: ["pawn_id"]
            isOneToOne: false
            referencedRelation: "pawns"
            referencedColumns: ["id"]
          },
        ]
      }
      pawns: {
        Row: {
          collateral_detail: string | null
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
          loan_amount: number
          loan_date: string
          loan_period: number
          notes: string | null
          status: Database["public"]["Enums"]["pawn_status"] | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          collateral_detail?: string | null
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
          loan_amount: number
          loan_date: string
          loan_period: number
          notes?: string | null
          status?: Database["public"]["Enums"]["pawn_status"] | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          collateral_detail?: string | null
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
      permissions: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          module: string | null
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id: string
          module?: string | null
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          module?: string | null
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permissions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "permissions"
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
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean | null
          role?: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          is_banned?: boolean | null
          role?: string
          username?: string
        }
        Relationships: []
      }
      store_fund_history: {
        Row: {
          created_at: string | null
          fund_amount: number
          id: string
          note: string | null
          store_id: string
          transaction_type: string | null
        }
        Insert: {
          created_at?: string | null
          fund_amount: number
          id?: string
          note?: string | null
          store_id: string
          transaction_type?: string | null
        }
        Update: {
          created_at?: string | null
          fund_amount?: number
          id?: string
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
      stores: {
        Row: {
          address: string
          cash_fund: number
          created_at: string
          id: string
          investment: number
          is_deleted: boolean
          name: string
          phone: string
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          cash_fund?: number
          created_at?: string
          id?: string
          investment?: number
          is_deleted?: boolean
          name: string
          phone: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          cash_fund?: number
          created_at?: string
          id?: string
          investment?: number
          is_deleted?: boolean
          name?: string
          phone?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
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
          payment_period: number | null
          status: Database["public"]["Enums"]["installment_status"] | null
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
    }
    Functions: {
      activate_employee_transaction: {
        Args: { employee_id: string }
        Returns: Json
      }
      calculate_credit_end_date: {
        Args: { loan_date: string; loan_period: number }
        Returns: string
      }
      credit_additional_loan: {
        Args: {
          p_credit_id: string
          p_additional_amount: number
          p_transaction_date: string
          p_notes: string
        }
        Returns: string
      }
      credit_principal_repayment: {
        Args: {
          p_credit_id: string
          p_repayment_amount: number
          p_transaction_date: string
          p_notes: string
        }
        Returns: string
      }
      deactivate_employee_transaction: {
        Args: { employee_id: string }
        Returns: Json
      }
      handle_pawn_payment_marking: {
        Args: { p_pawn_id: string; p_periods: Json; p_action: string }
        Returns: Json
      }
      handle_payment_marking: {
        Args: { p_credit_id: string; p_periods: Json; p_action: string }
        Returns: Json
      }
      recreate_payment_periods: {
        Args: { credit_id_param: string; periods_param: Json }
        Returns: Json
      }
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
      payment_period_status: "pending" | "paid" | "overdue" | "partially_paid"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
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
      ],
      payment_period_status: ["pending", "paid", "overdue", "partially_paid"],
    },
  },
} as const
