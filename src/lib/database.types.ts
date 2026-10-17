
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "allowance_changes": {
                  Row: {
                    "changed_at": string,"changed_by": string,"id": number,"leave_type_id": string,"new_days": number | null,"old_days": number | null,"reason": string | null,"user_id": string | null,"year": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by": string,"id"?: never,"leave_type_id": string,"new_days"?: number | null,"old_days"?: number | null,"reason"?: string | null,"user_id"?: string | null,"year"?: number | null
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string,"id"?: never,"leave_type_id"?: string,"new_days"?: number | null,"old_days"?: number | null,"reason"?: string | null,"user_id"?: string | null,"year"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowance_changes_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_changes_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_changes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"allowance_overrides": {
                  Row: {
                    "days": number,"leave_type_id": string,"user_id": string,"year": number
                  }
                  ComputedFields: never
                  Insert: {
                    "days": number,"leave_type_id": string,"user_id": string,"year": number
                  }
                  Update: {
                    "days"?: number,"leave_type_id"?: string,"user_id"?: string,"year"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "allowance_overrides_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "allowance_overrides_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"holiday_regions": {
                  Row: {
                    "code": string,"created_at": string,"default_timezone": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"default_timezone": string,"name": string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"default_timezone"?: string,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"leave_requests": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"decision_comment": string | null,"end_date": string,"id": string,"leave_type_id": string,"note": string | null,"over_balance_days": number | null,"region_code": string,"start_date": string,"status": Database["public"]['Enums']["request_status"],"user_id": string,"working_days": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_comment"?: string | null,"end_date": string,"id"?: string,"leave_type_id": string,"note"?: string | null,"over_balance_days"?: number | null,"region_code": string,"start_date": string,"status"?: Database["public"]['Enums']["request_status"],"user_id": string,"working_days": number
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"decision_comment"?: string | null,"end_date"?: string,"id"?: string,"leave_type_id"?: string,"note"?: string | null,"over_balance_days"?: number | null,"region_code"?: string,"start_date"?: string,"status"?: Database["public"]['Enums']["request_status"],"user_id"?: string,"working_days"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "leave_requests_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_leave_type_id_fkey"
      columns: ["leave_type_id"]
isOneToOne: false
      referencedRelation: "leave_types"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leave_requests_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "holiday_regions"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "leave_requests_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"leave_types": {
                  Row: {
                    "default_allowance": number | null,"id": string,"is_active": boolean,"is_capped": boolean,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "default_allowance"?: number | null,"id"?: string,"is_active"?: boolean,"is_capped": boolean,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "default_allowance"?: number | null,"id"?: string,"is_active"?: boolean,"is_capped"?: boolean,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string,"id": string,"is_active": boolean,"is_demo": boolean,"region_code": string,"role": Database["public"]['Enums']["app_role"],"timezone": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name": string,"id": string,"is_active"?: boolean,"is_demo"?: boolean,"region_code": string,"role"?: Database["public"]['Enums']["app_role"],"timezone": string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"is_active"?: boolean,"is_demo"?: boolean,"region_code"?: string,"role"?: Database["public"]['Enums']["app_role"],"timezone"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "holiday_regions"
      referencedColumns: ["code"]
    }
                  ]
                },"public_holidays": {
                  Row: {
                    "holiday_date": string,"id": string,"name": string,"region_code": string
                  }
                  ComputedFields: never
                  Insert: {
                    "holiday_date": string,"id"?: string,"name": string,"region_code": string
                  }
                  Update: {
                    "holiday_date"?: string,"id"?: string,"name"?: string,"region_code"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "public_holidays_region_code_fkey"
      columns: ["region_code"]
isOneToOne: false
      referencedRelation: "holiday_regions"
      referencedColumns: ["code"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_create_profile":
{ Args: { "p_email": string,"p_full_name": string,"p_region_code": string,"p_role": Database["public"]['Enums']["app_role"],"p_timezone"?: string,"p_user_id": string }; Returns: {
              "created_at": string,
"email": string,
"full_name": string,
"id": string,
"is_active": boolean,
"is_demo": boolean,
"region_code": string,
"role": Database["public"]['Enums']["app_role"],
"timezone": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_set_active":
{ Args: { "p_active": boolean,"p_user_id": string }; Returns: {
              "created_at": string,
"email": string,
"full_name": string,
"id": string,
"is_active": boolean,
"is_demo": boolean,
"region_code": string,
"role": Database["public"]['Enums']["app_role"],
"timezone": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_set_allowance":
{ Args: { "p_days": number,"p_leave_type_id": string,"p_reason"?: string,"p_user_id": string,"p_year": number }; Returns: {
              "days": number,
"leave_type_id": string,
"user_id": string,
"year": number
            }
                          SetofOptions: {
        from: "*"
        to: "allowance_overrides"
        isOneToOne: true
        isSetofReturn: false
      } },
"admin_set_demo_active":
{ Args: { "p_active": boolean }; Returns: (string)[]
                           },
"admin_update_user":
{ Args: { "p_full_name": string,"p_region_code": string,"p_role": Database["public"]['Enums']["app_role"],"p_user_id": string }; Returns: {
              "created_at": string,
"email": string,
"full_name": string,
"id": string,
"is_active": boolean,
"is_demo": boolean,
"region_code": string,
"role": Database["public"]['Enums']["app_role"],
"timezone": string
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"assert_valid_timezone":
{ Args: { "tz": string }; Returns: undefined
                           },
"get_balances":
{ Args: { "p_user_id": string,"p_year": number }; Returns: {
              "allowance": number,"available": number,"is_capped": boolean,"leave_type_id": string,"name": string,"pending": number,"taken": number
            }[]
                           },
"health":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"whoami":
{ Args: Record<PropertyKey, never>; Returns: Json
                           }
          }
          Enums: {
            "app_role": "employee"|"manager"|"admin","request_status": "pending"|"approved"|"declined"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["employee", "manager", "admin"],"request_status": ["pending", "approved", "declined"]
          }
        }
} as const
