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
      accounts: {
        Row: {
          archived: boolean
          balance: number
          balance_updated_at: string
          created_at: string
          id: string
          name: string
          type: Database["public"]["Enums"]["account_type"]
          user_id: string
        }
        Insert: {
          archived?: boolean
          balance?: number
          balance_updated_at?: string
          created_at?: string
          id?: string
          name: string
          type: Database["public"]["Enums"]["account_type"]
          user_id?: string
        }
        Update: {
          archived?: boolean
          balance?: number
          balance_updated_at?: string
          created_at?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["account_type"]
          user_id?: string
        }
        Relationships: []
      }
      debt_payments: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          date: string
          debt_id: string
          id: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          date: string
          debt_id: string
          id?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          date?: string
          debt_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "debt_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "debt_payments_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "v_debt_balances"
            referencedColumns: ["debt_id"]
          },
        ]
      }
      debts: {
        Row: {
          amount: number
          created_at: string
          date: string
          description: string
          direction: Database["public"]["Enums"]["debt_direction"]
          id: string
          person: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          description?: string
          direction: Database["public"]["Enums"]["debt_direction"]
          id?: string
          person: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          description?: string
          direction?: Database["public"]["Enums"]["debt_direction"]
          id?: string
          person?: string
          user_id?: string
        }
        Relationships: []
      }
      expense_tags: {
        Row: {
          expense_id: string
          tag_id: string
        }
        Insert: {
          expense_id: string
          tag_id: string
        }
        Update: {
          expense_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_tags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tags_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "v_expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_by_tag_month"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "expense_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_tag_usage"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          created_at: string
          date: string
          deducted: boolean
          description: string
          id: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          created_at?: string
          date: string
          deducted?: boolean
          description?: string
          id?: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          created_at?: string
          date?: string
          deducted?: boolean
          description?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      investment_contributions: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          investment_id: string
          note: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          date: string
          id?: string
          investment_id: string
          note?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          investment_id?: string
          note?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investment_contributions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_contributions_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "v_investment_stats"
            referencedColumns: ["investment_id"]
          },
        ]
      }
      investment_valuations: {
        Row: {
          contribution_id: string | null
          created_at: string
          date: string
          id: string
          investment_id: string
          user_id: string
          value: number
        }
        Insert: {
          contribution_id?: string | null
          created_at?: string
          date: string
          id?: string
          investment_id: string
          user_id?: string
          value: number
        }
        Update: {
          contribution_id?: string | null
          created_at?: string
          date?: string
          id?: string
          investment_id?: string
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "investment_valuations_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "investment_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_valuations_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "investments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_valuations_investment_id_fkey"
            columns: ["investment_id"]
            isOneToOne: false
            referencedRelation: "v_investment_stats"
            referencedColumns: ["investment_id"]
          },
        ]
      }
      investments: {
        Row: {
          account_id: string | null
          archived: boolean
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          archived?: boolean
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          account_id?: string | null
          archived?: boolean
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "investments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          currency: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          currency?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_item_tags: {
        Row: {
          recurring_item_id: string
          tag_id: string
        }
        Insert: {
          recurring_item_id: string
          tag_id: string
        }
        Update: {
          recurring_item_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_item_tags_recurring_item_id_fkey"
            columns: ["recurring_item_id"]
            isOneToOne: false
            referencedRelation: "recurring_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_item_tags_recurring_item_id_fkey"
            columns: ["recurring_item_id"]
            isOneToOne: false
            referencedRelation: "v_recurring_monthly"
            referencedColumns: ["recurring_item_id"]
          },
          {
            foreignKeyName: "recurring_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_expenses_by_tag_month"
            referencedColumns: ["tag_id"]
          },
          {
            foreignKeyName: "recurring_item_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "v_tag_usage"
            referencedColumns: ["tag_id"]
          },
        ]
      }
      recurring_items: {
        Row: {
          account_id: string | null
          active: boolean
          amount: number
          created_at: string
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id: string
          kind: Database["public"]["Enums"]["recurring_kind"]
          monthly_amount: number | null
          name: string
          start_date: string | null
          user_id: string
        }
        Insert: {
          account_id?: string | null
          active?: boolean
          amount: number
          created_at?: string
          end_date?: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          kind: Database["public"]["Enums"]["recurring_kind"]
          monthly_amount?: number | null
          name: string
          start_date?: string | null
          user_id?: string
        }
        Update: {
          account_id?: string | null
          active?: boolean
          amount?: number
          created_at?: string
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["recurring_frequency"]
          id?: string
          kind?: Database["public"]["Enums"]["recurring_kind"]
          monthly_amount?: number | null
          name?: string
          start_date?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_debt_balances: {
        Row: {
          amount: number | null
          created_at: string | null
          date: string | null
          debt_id: string | null
          description: string | null
          direction: Database["public"]["Enums"]["debt_direction"] | null
          paid: number | null
          person: string | null
          remaining: number | null
          settled: boolean | null
        }
        Relationships: []
      }
      v_debt_people: {
        Row: {
          i_owe: number | null
          net: number | null
          owed_to_me: number | null
          person: string | null
        }
        Relationships: []
      }
      v_expenses: {
        Row: {
          account_id: string | null
          amount: number | null
          created_at: string | null
          date: string | null
          deducted: boolean | null
          description: string | null
          id: string | null
          tag_ids: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_expenses_by_tag_month: {
        Row: {
          count: number | null
          month: string | null
          tag_color: string | null
          tag_id: string | null
          tag_name: string | null
          total: number | null
        }
        Relationships: []
      }
      v_investment_stats: {
        Row: {
          account_id: string | null
          annualized_pct: number | null
          archived: boolean | null
          created_at: string | null
          current_value: number | null
          first_contribution_date: string | null
          gain: number | null
          invested: number | null
          investment_id: string | null
          last_valuation_date: string | null
          name: string | null
          return_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_money_by_location: {
        Row: {
          account_id: string | null
          cash: number | null
          investments: number | null
          name: string | null
          total: number | null
          type: Database["public"]["Enums"]["account_type"] | null
        }
        Relationships: []
      }
      v_net_worth: {
        Row: {
          accounts_total: number | null
          i_owe: number | null
          investments_gain: number | null
          investments_invested: number | null
          investments_total: number | null
          net_worth: number | null
          owed_to_me: number | null
        }
        Relationships: []
      }
      v_recurring_monthly: {
        Row: {
          account_id: string | null
          active: boolean | null
          amount: number | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["recurring_frequency"] | null
          kind: Database["public"]["Enums"]["recurring_kind"] | null
          monthly_amount: number | null
          name: string | null
          recurring_item_id: string | null
          start_date: string | null
          tag_ids: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_items_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tag_usage: {
        Row: {
          color: string | null
          expense_count: number | null
          expense_total: number | null
          name: string | null
          recurring_count: number | null
          tag_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_contribution: {
        Args: {
          p_amount: number
          p_date: string
          p_investment_id: string
          p_note: string
        }
        Returns: string
      }
      add_debt_payment: {
        Args: {
          p_account_id: string
          p_amount: number
          p_date: string
          p_debt_id: string
        }
        Returns: string
      }
      adjust_account_balance: {
        Args: { p_account_id: string; p_delta: number }
        Returns: undefined
      }
      assert_tags_exist: { Args: { p_tag_ids: string[] }; Returns: undefined }
      assert_usable_account: {
        Args: { p_account_id: string }
        Returns: undefined
      }
      create_expense: {
        Args: {
          p_account_id: string
          p_amount: number
          p_date: string
          p_deduct: boolean
          p_description: string
          p_tag_ids: string[]
        }
        Returns: string
      }
      create_investment: {
        Args: {
          p_account_id: string
          p_amount: number
          p_date: string
          p_name: string
        }
        Returns: string
      }
      debt_payment_sign: {
        Args: { p_direction: Database["public"]["Enums"]["debt_direction"] }
        Returns: number
      }
      delete_debt: { Args: { p_id: string }; Returns: undefined }
      delete_debt_payment: { Args: { p_id: string }; Returns: undefined }
      delete_expense: { Args: { p_id: string }; Returns: undefined }
      get_month_summary: {
        Args: { p_month: string }
        Returns: {
          available: number
          fixed_expense: number
          fixed_income: number
          month: string
          remaining: number
          variable_count: number
          variable_total: number
        }[]
      }
      set_account_balance: {
        Args: { p_account_id: string; p_balance: number }
        Returns: undefined
      }
      set_recurring_item: {
        Args: {
          p_account_id: string
          p_active: boolean
          p_amount: number
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["recurring_frequency"]
          p_id: string
          p_kind: Database["public"]["Enums"]["recurring_kind"]
          p_name: string
          p_start_date: string
          p_tag_ids: string[]
        }
        Returns: string
      }
      update_expense: {
        Args: {
          p_account_id: string
          p_amount: number
          p_date: string
          p_deduct: boolean
          p_description: string
          p_id: string
          p_tag_ids: string[]
        }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "bank" | "cash" | "savings" | "broker" | "crypto" | "other"
      debt_direction: "owed_to_me" | "i_owe"
      recurring_frequency: "monthly" | "quarterly" | "semiannual" | "yearly"
      recurring_kind: "income" | "expense"
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
      account_type: ["bank", "cash", "savings", "broker", "crypto", "other"],
      debt_direction: ["owed_to_me", "i_owe"],
      recurring_frequency: ["monthly", "quarterly", "semiannual", "yearly"],
      recurring_kind: ["income", "expense"],
    },
  },
} as const

