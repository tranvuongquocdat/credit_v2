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
      credit_payment_periods: {
        Row: {
          actual_amount: number
          created_at: string | null
          credit_id: string
          end_date: string
          expected_amount: number
          id: string
          notes: string | null
          payment_date: string | null
          period_number: number
          start_date: string
          status: Database["public"]["Enums"]["payment_period_status"]
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
          payment_date?: string | null
          period_number: number
          start_date: string
          status?: Database["public"]["Enums"]["payment_period_status"]
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
          payment_date?: string | null
          period_number?: number
          start_date?: string
          status?: Database["public"]["Enums"]["payment_period_status"]
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
          address: string | null
          collateral: string | null
          contract_code: string | null
          created_at: string | null
          customer_id: string
          id: string
          id_number: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_value: number
          loan_amount: number
          loan_date: string
          loan_period: number
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["credit_status"] | null
          store_id: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          collateral?: string | null
          contract_code?: string | null
          created_at?: string | null
          customer_id: string
          id?: string
          id_number?: string | null
          interest_period: number
          interest_type: Database["public"]["Enums"]["interest_type"]
          interest_value: number
          loan_amount: number
          loan_date: string
          loan_period: number
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["credit_status"] | null
          store_id: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          collateral?: string | null
          contract_code?: string | null
          created_at?: string | null
          customer_id?: string
          id?: string
          id_number?: string | null
          interest_period?: number
          interest_type?: Database["public"]["Enums"]["interest_type"]
          interest_value?: number
          loan_amount?: number
          loan_date?: string
          loan_period?: number
          notes?: string | null
          phone?: string | null
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
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          role: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          username?: string
        }
        Relationships: []
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
      users: {
        Row: {
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          username: string | null
        }
        Insert: {
          email?: string | null
          first_name?: string | null
          id: string
          last_name?: string | null
          username?: string | null
        }
        Update: {
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      interest_type: "percentage" | "fixed_amount"
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
      interest_type: ["percentage", "fixed_amount"],
      payment_period_status: ["pending", "paid", "overdue", "partially_paid"],
    },
  },
} as const
