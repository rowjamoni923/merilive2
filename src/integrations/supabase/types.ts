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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_lockouts: {
        Row: {
          failed_attempts: number | null
          id: string
          identifier: string
          locked_at: string
          locked_until: string
          reason: string | null
        }
        Insert: {
          failed_attempts?: number | null
          id?: string
          identifier: string
          locked_at?: string
          locked_until: string
          reason?: string | null
        }
        Update: {
          failed_attempts?: number | null
          id?: string
          identifier?: string
          locked_at?: string
          locked_until?: string
          reason?: string | null
        }
        Relationships: []
      }
      admin_access_tokens: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          label: string | null
          last_used_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          token: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_used_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          token: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          last_used_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          token?: string
        }
        Relationships: []
      }
      admin_allowed_devices: {
        Row: {
          admin_user_id: string
          approved_at: string | null
          approved_by: string | null
          created_at: string | null
          device_fingerprint: string
          device_info: Json | null
          device_name: string | null
          id: string
          ip_address: string | null
          last_used_at: string | null
          notes: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_at: string | null
          status: Database["public"]["Enums"]["admin_device_status"] | null
          user_agent: string | null
        }
        Insert: {
          admin_user_id: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          device_fingerprint: string
          device_info?: Json | null
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_used_at?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["admin_device_status"] | null
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string | null
          device_fingerprint?: string
          device_info?: Json | null
          device_name?: string | null
          id?: string
          ip_address?: string | null
          last_used_at?: string | null
          notes?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_at?: string | null
          status?: Database["public"]["Enums"]["admin_device_status"] | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_allowed_devices_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          display_name: string | null
          email: string
          expires_at: string | null
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["admin_role"] | null
          sections_access: string[] | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          expires_at?: string | null
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["admin_role"] | null
          sections_access?: string[] | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["admin_role"] | null
          sections_access?: string[] | null
          token?: string
        }
        Relationships: []
      }
      admin_login_otps: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
        }
        Relationships: []
      }
      admin_logs: {
        Row: {
          action_type: string
          admin_id: string | null
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action_type: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action_type?: string
          admin_id?: string | null
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_music_library: {
        Row: {
          artist: string
          audio_url: string
          category: string | null
          cover_image_url: string | null
          created_at: string
          display_order: number | null
          duration_seconds: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          title: string
          updated_at: string
        }
        Insert: {
          artist: string
          audio_url: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string
        }
        Update: {
          artist?: string
          audio_url?: string
          category?: string | null
          cover_image_url?: string | null
          created_at?: string
          display_order?: number | null
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_notices: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          message: string
          priority: string
          read_by: string[] | null
          target_audience: string[]
          title: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          message: string
          priority?: string
          read_by?: string[] | null
          target_audience?: string[]
          title: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          message?: string
          priority?: string
          read_by?: string[] | null
          target_audience?: string[]
          title?: string
        }
        Relationships: []
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string | null
          priority: string | null
          target_role: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          target_role?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          priority?: string | null
          target_role?: string | null
          title?: string
          type?: string
        }
        Relationships: []
      }
      admin_owner_whitelist: {
        Row: {
          added_by: string | null
          created_at: string
          display_name: string | null
          email: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          display_name?: string | null
          email: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          display_name?: string | null
          email?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      admin_pending_actions: {
        Row: {
          action_type: string
          created_at: string
          executed_result: Json | null
          id: string
          owner_notes: string | null
          payload: Json
          reason: string | null
          requested_by: string
          requested_by_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          target_agency_id: string | null
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          action_type: string
          created_at?: string
          executed_result?: Json | null
          id?: string
          owner_notes?: string | null
          payload?: Json
          reason?: string | null
          requested_by: string
          requested_by_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          target_agency_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: string
          created_at?: string
          executed_result?: Json | null
          id?: string
          owner_notes?: string | null
          payload?: Json
          reason?: string | null
          requested_by?: string
          requested_by_name?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_name?: string | null
          status?: string
          target_agency_id?: string | null
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      admin_permanent_ban_case_targets: {
        Row: {
          case_id: string
          created_at: string
          id: string
          relation_details: Json
          source: string
          user_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          relation_details?: Json
          source: string
          user_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          relation_details?: Json
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_permanent_ban_case_targets_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "admin_permanent_ban_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_permanent_ban_cases: {
        Row: {
          created_at: string
          evidence: Json
          executed_at: string | null
          executed_by: string | null
          execution_summary: Json | null
          id: string
          include_gift_links: boolean
          initiated_by: string
          linked_target_count: number
          lookback_days: number
          reason: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          target_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          executed_at?: string | null
          executed_by?: string | null
          execution_summary?: Json | null
          id?: string
          include_gift_links?: boolean
          initiated_by: string
          linked_target_count?: number
          lookback_days?: number
          reason: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          executed_at?: string | null
          executed_by?: string | null
          execution_summary?: Json | null
          id?: string
          include_gift_links?: boolean
          initiated_by?: string
          linked_target_count?: number
          lookback_days?: number
          reason?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          target_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_pin_otp: {
        Row: {
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          otp_hash: string
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          otp_hash: string
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          otp_hash?: string
        }
        Relationships: []
      }
      admin_pin_trusted_devices: {
        Row: {
          device_fingerprint: string
          trusted_at: string
          trusted_by_admin: string | null
          user_agent: string | null
        }
        Insert: {
          device_fingerprint: string
          trusted_at?: string
          trusted_by_admin?: string | null
          user_agent?: string | null
        }
        Update: {
          device_fingerprint?: string
          trusted_at?: string
          trusted_by_admin?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      admin_section_permissions: {
        Row: {
          admin_user_id: string
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          granted_at: string | null
          granted_by: string | null
          id: string
          section_id: string
        }
        Insert: {
          admin_user_id: string
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          section_id: string
        }
        Update: {
          admin_user_id?: string
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          section_id?: string
        }
        Relationships: []
      }
      admin_sections: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          hub_key: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          section_key: string
          section_name: string
          section_name_bn: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hub_key?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          section_key: string
          section_name: string
          section_name_bn?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hub_key?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          section_key?: string
          section_name?: string
          section_name_bn?: string | null
        }
        Relationships: []
      }
      admin_security_pin: {
        Row: {
          failed_attempts: number
          id: boolean
          locked_until: string | null
          pin_hash: string
          set_at: string
          set_by: string | null
        }
        Insert: {
          failed_attempts?: number
          id?: boolean
          locked_until?: string | null
          pin_hash: string
          set_at?: string
          set_by?: string | null
        }
        Update: {
          failed_attempts?: number
          id?: boolean
          locked_until?: string | null
          pin_hash?: string
          set_at?: string
          set_by?: string | null
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          admin_user_id: string
          created_at: string
          device_fingerprint: string | null
          expires_at: string
          id: string
          ip_address: string | null
          last_active_at: string
          session_token: string
          user_agent: string | null
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          device_fingerprint?: string | null
          expires_at: string
          id?: string
          ip_address?: string | null
          last_active_at?: string
          session_token: string
          user_agent?: string | null
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          device_fingerprint?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          last_active_at?: string
          session_token?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_stats: {
        Row: {
          created_at: string | null
          daily_active_users: number | null
          id: string
          stat_date: string
          total_agencies: number | null
          total_coins_spent: number | null
          total_gifts_sent: number | null
          total_hosts: number | null
          total_party_rooms: number | null
          total_streams: number | null
          total_users: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          daily_active_users?: number | null
          id?: string
          stat_date?: string
          total_agencies?: number | null
          total_coins_spent?: number | null
          total_gifts_sent?: number | null
          total_hosts?: number | null
          total_party_rooms?: number | null
          total_streams?: number | null
          total_users?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          daily_active_users?: number | null
          id?: string
          stat_date?: string
          total_agencies?: number | null
          total_coins_spent?: number | null
          total_gifts_sent?: number | null
          total_hosts?: number | null
          total_party_rooms?: number | null
          total_streams?: number | null
          total_users?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_token_overrides: {
        Row: {
          kind: string
          rotated_at: string
          rotated_by: string | null
          rotated_year: number
          token: string
        }
        Insert: {
          kind: string
          rotated_at?: string
          rotated_by?: string | null
          rotated_year?: number
          token: string
        }
        Update: {
          kind?: string
          rotated_at?: string
          rotated_by?: string | null
          rotated_year?: number
          token?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          display_name: string | null
          email: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          is_decoupled: boolean | null
          last_login_at: string | null
          must_change_password: boolean | null
          password_hash: string | null
          password_reset_at: string | null
          password_reset_by: string | null
          password_set_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          support_display_name: string | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          is_decoupled?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          password_hash?: string | null
          password_reset_at?: string | null
          password_reset_by?: string | null
          password_set_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          support_display_name?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          is_decoupled?: boolean | null
          last_login_at?: string | null
          must_change_password?: boolean | null
          password_hash?: string | null
          password_reset_at?: string | null
          password_reset_by?: string | null
          password_set_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          support_display_name?: string | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      agencies: {
        Row: {
          agency_code: string
          beans_balance: number | null
          blocked_at: string | null
          blocked_reason: string | null
          commission_rate: number | null
          created_at: string | null
          diamond_balance: number
          email: string | null
          id: string
          is_active: boolean | null
          is_blocked: boolean | null
          level: string | null
          logo_url: string | null
          name: string
          owner_id: string | null
          parent_agency_id: string | null
          registration_meta: Json | null
          total_agents: number | null
          total_hosts: number | null
          updated_at: string | null
          wallet_balance: number | null
          whatsapp_number: string | null
        }
        Insert: {
          agency_code: string
          beans_balance?: number | null
          blocked_at?: string | null
          blocked_reason?: string | null
          commission_rate?: number | null
          created_at?: string | null
          diamond_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          level?: string | null
          logo_url?: string | null
          name: string
          owner_id?: string | null
          parent_agency_id?: string | null
          registration_meta?: Json | null
          total_agents?: number | null
          total_hosts?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
          whatsapp_number?: string | null
        }
        Update: {
          agency_code?: string
          beans_balance?: number | null
          blocked_at?: string | null
          blocked_reason?: string | null
          commission_rate?: number | null
          created_at?: string | null
          diamond_balance?: number
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_blocked?: boolean | null
          level?: string | null
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          parent_agency_id?: string | null
          registration_meta?: Json | null
          total_agents?: number | null
          total_hosts?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_commission_history: {
        Row: {
          agency_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          host_id: string
          id: string
          notes: string | null
          original_amount: number
          source_transaction_id: string | null
          transaction_type: string
        }
        Insert: {
          agency_id: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          host_id: string
          id?: string
          notes?: string | null
          original_amount?: number
          source_transaction_id?: string | null
          transaction_type?: string
        }
        Update: {
          agency_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          host_id?: string
          id?: string
          notes?: string | null
          original_amount?: number
          source_transaction_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_commission_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_commission_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_diamond_transactions: {
        Row: {
          agency_id: string
          beans_amount: number
          created_at: string
          diamond_amount: number
          fee_amount: number
          id: string
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          agency_id: string
          beans_amount?: number
          created_at?: string
          diamond_amount?: number
          fee_amount?: number
          id?: string
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          agency_id?: string
          beans_amount?: number
          created_at?: string
          diamond_amount?: number
          fee_amount?: number
          id?: string
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_diamond_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_diamond_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_earnings_transfers: {
        Row: {
          agency_id: string
          agency_name: string | null
          amount: number
          call_earnings: number | null
          commission_rate: number | null
          created_at: string
          gift_earnings: number | null
          host_id: string
          host_name: string | null
          host_uid: string | null
          id: string
          notes: string | null
          period_end: string | null
          period_start: string | null
          processed_at: string | null
          status: string
          transfer_type: string
        }
        Insert: {
          agency_id: string
          agency_name?: string | null
          amount?: number
          call_earnings?: number | null
          commission_rate?: number | null
          created_at?: string
          gift_earnings?: number | null
          host_id: string
          host_name?: string | null
          host_uid?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          status?: string
          transfer_type?: string
        }
        Update: {
          agency_id?: string
          agency_name?: string | null
          amount?: number
          call_earnings?: number | null
          commission_rate?: number | null
          created_at?: string
          gift_earnings?: number | null
          host_id?: string
          host_name?: string | null
          host_uid?: string | null
          id?: string
          notes?: string | null
          period_end?: string | null
          period_start?: string | null
          processed_at?: string | null
          status?: string
          transfer_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_earnings_transfers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_earnings_transfers_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_earnings_transfers_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_earnings_transfers_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_faqs: {
        Row: {
          answer: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          question: string
        }
        Insert: {
          answer: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question: string
        }
        Update: {
          answer?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          question?: string
        }
        Relationships: []
      }
      agency_host_requests: {
        Row: {
          agency_id: string
          created_at: string
          host_id: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          agency_id: string
          created_at?: string
          host_id: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agency_id?: string
          created_at?: string
          host_id?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_host_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_host_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_host_requests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_host_requests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_hosts: {
        Row: {
          agency_id: string
          host_id: string
          id: string
          joined_at: string | null
          joined_via: string | null
          left_at: string | null
          referral_code: string | null
          status: string | null
        }
        Insert: {
          agency_id: string
          host_id: string
          id?: string
          joined_at?: string | null
          joined_via?: string | null
          left_at?: string | null
          referral_code?: string | null
          status?: string | null
        }
        Update: {
          agency_id?: string
          host_id?: string
          id?: string
          joined_at?: string | null
          joined_via?: string | null
          left_at?: string | null
          referral_code?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_hosts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_hosts_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_hosts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_hosts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_level_tiers: {
        Row: {
          badge_color: string | null
          commission_rate: number
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          level_code: string
          level_name: string
          max_weekly_income: number
          min_weekly_income: number
          updated_at: string | null
        }
        Insert: {
          badge_color?: string | null
          commission_rate?: number
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          level_code: string
          level_name: string
          max_weekly_income?: number
          min_weekly_income?: number
          updated_at?: string | null
        }
        Update: {
          badge_color?: string | null
          commission_rate?: number
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          level_code?: string
          level_name?: string
          max_weekly_income?: number
          min_weekly_income?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      agency_performance: {
        Row: {
          agency_id: string
          created_at: string | null
          golden_host_income: number | null
          id: string
          new_hosts_count: number | null
          period_start: string
          period_type: string
          total_host_hours: number | null
          total_income: number | null
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          created_at?: string | null
          golden_host_income?: number | null
          id?: string
          new_hosts_count?: number | null
          period_start: string
          period_type: string
          total_host_hours?: number | null
          total_income?: number | null
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          created_at?: string | null
          golden_host_income?: number | null
          id?: string
          new_hosts_count?: number | null
          period_start?: string
          period_type?: string
          total_host_hours?: number | null
          total_income?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_performance_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_performance_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_policy_settings: {
        Row: {
          content: Json
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          section_key: string
          section_title: string
          updated_at: string
        }
        Insert: {
          content?: Json
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          section_key: string
          section_title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          section_key?: string
          section_title?: string
          updated_at?: string
        }
        Relationships: []
      }
      agency_rankings: {
        Row: {
          agency_id: string
          country_code: string | null
          country_flag: string | null
          created_at: string | null
          id: string
          metric_value: number | null
          period_end: string
          period_start: string
          period_type: string
          rank_position: number
          ranking_type: string
          updated_at: string | null
        }
        Insert: {
          agency_id: string
          country_code?: string | null
          country_flag?: string | null
          created_at?: string | null
          id?: string
          metric_value?: number | null
          period_end: string
          period_start: string
          period_type: string
          rank_position: number
          ranking_type: string
          updated_at?: string | null
        }
        Update: {
          agency_id?: string
          country_code?: string | null
          country_flag?: string | null
          created_at?: string | null
          id?: string
          metric_value?: number | null
          period_end?: string
          period_start?: string
          period_type?: string
          rank_position?: number
          ranking_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_rankings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_rankings_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_withdrawal_locks: {
        Row: {
          helper_id: string
          locked_at: string | null
          withdrawal_id: string
        }
        Insert: {
          helper_id: string
          locked_at?: string | null
          withdrawal_id: string
        }
        Update: {
          helper_id?: string
          locked_at?: string | null
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agency_withdrawal_locks_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawal_locks_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawal_locks_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: true
            referencedRelation: "agency_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_withdrawals: {
        Row: {
          admin_note: string | null
          agency_id: string
          amount: number
          assigned_helper_id: string | null
          claim_locked_until: string | null
          country_code: string | null
          currency: string | null
          exchange_rate: number | null
          fee_percentage: number | null
          helper_processed_at: string | null
          helper_proof: Json | null
          id: string
          net_amount_money: number | null
          net_diamonds_to_helper: number | null
          notes: string | null
          payment_details: Json | null
          payment_method: string | null
          payment_method_type: string | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
          usd_amount: number | null
        }
        Insert: {
          admin_note?: string | null
          agency_id: string
          amount: number
          assigned_helper_id?: string | null
          claim_locked_until?: string | null
          country_code?: string | null
          currency?: string | null
          exchange_rate?: number | null
          fee_percentage?: number | null
          helper_processed_at?: string | null
          helper_proof?: Json | null
          id?: string
          net_amount_money?: number | null
          net_diamonds_to_helper?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_method_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          usd_amount?: number | null
        }
        Update: {
          admin_note?: string | null
          agency_id?: string
          amount?: number
          assigned_helper_id?: string | null
          claim_locked_until?: string | null
          country_code?: string | null
          currency?: string | null
          exchange_rate?: number | null
          fee_percentage?: number | null
          helper_processed_at?: string | null
          helper_proof?: Json | null
          id?: string
          net_amount_money?: number | null
          net_diamonds_to_helper?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_method_type?: string | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
          usd_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_withdrawals_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawals_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawals_assigned_helper_id_fkey"
            columns: ["assigned_helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawals_assigned_helper_id_fkey"
            columns: ["assigned_helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_withdrawals_assigned_helper_id_fkey"
            columns: ["assigned_helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_external_links: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string | null
          link_type: string | null
          updated_at: string | null
          url: string
          url_pattern: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          link_type?: string | null
          updated_at?: string | null
          url: string
          url_pattern?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          link_type?: string | null
          updated_at?: string | null
          url?: string
          url_pattern?: string | null
        }
        Relationships: []
      }
      app_content: {
        Row: {
          content: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_published: boolean | null
          language: string | null
          page_key: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          language?: string | null
          page_key?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_published?: boolean | null
          language?: string | null
          page_key?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_event_themes: {
        Row: {
          accent_color: string | null
          auto_schedule: boolean | null
          card_border_color: string | null
          color_scheme: Json | null
          country_code: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          ends_at: string | null
          event_type: string
          floating_particles: string[] | null
          header_gradient_from: string | null
          header_gradient_to: string | null
          home_banner_url: string | null
          icon_set: Json | null
          id: string
          is_active: boolean | null
          login_bg_url: string | null
          nav_active_color: string | null
          nav_bg_color: string | null
          nav_home_icon_url: string | null
          nav_party_icon_url: string | null
          nav_profile_icon_url: string | null
          nav_reels_icon_url: string | null
          primary_color: string | null
          secondary_color: string | null
          splash_image_url: string | null
          start_date: string | null
          starts_at: string | null
          tab_active_color: string | null
          theme_icon: string | null
          theme_key: string | null
          theme_name: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          auto_schedule?: boolean | null
          card_border_color?: string | null
          color_scheme?: Json | null
          country_code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          ends_at?: string | null
          event_type: string
          floating_particles?: string[] | null
          header_gradient_from?: string | null
          header_gradient_to?: string | null
          home_banner_url?: string | null
          icon_set?: Json | null
          id?: string
          is_active?: boolean | null
          login_bg_url?: string | null
          nav_active_color?: string | null
          nav_bg_color?: string | null
          nav_home_icon_url?: string | null
          nav_party_icon_url?: string | null
          nav_profile_icon_url?: string | null
          nav_reels_icon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          splash_image_url?: string | null
          start_date?: string | null
          starts_at?: string | null
          tab_active_color?: string | null
          theme_icon?: string | null
          theme_key?: string | null
          theme_name: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          auto_schedule?: boolean | null
          card_border_color?: string | null
          color_scheme?: Json | null
          country_code?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          ends_at?: string | null
          event_type?: string
          floating_particles?: string[] | null
          header_gradient_from?: string | null
          header_gradient_to?: string | null
          home_banner_url?: string | null
          icon_set?: Json | null
          id?: string
          is_active?: boolean | null
          login_bg_url?: string | null
          nav_active_color?: string | null
          nav_bg_color?: string | null
          nav_home_icon_url?: string | null
          nav_party_icon_url?: string | null
          nav_profile_icon_url?: string | null
          nav_reels_icon_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          splash_image_url?: string | null
          start_date?: string | null
          starts_at?: string | null
          tab_active_color?: string | null
          theme_icon?: string | null
          theme_key?: string | null
          theme_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_icon_registry: {
        Row: {
          animation_url: string | null
          category: string | null
          color_hex: string | null
          created_at: string | null
          current_url: string | null
          default_url: string | null
          description: string | null
          display_order: number | null
          fallback_emoji: string | null
          icon_key: string
          icon_label: string
          icon_name: string | null
          icon_type: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          lucide_name: string | null
          platform: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          animation_url?: string | null
          category?: string | null
          color_hex?: string | null
          created_at?: string | null
          current_url?: string | null
          default_url?: string | null
          description?: string | null
          display_order?: number | null
          fallback_emoji?: string | null
          icon_key: string
          icon_label: string
          icon_name?: string | null
          icon_type?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          lucide_name?: string | null
          platform?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          animation_url?: string | null
          category?: string | null
          color_hex?: string | null
          created_at?: string | null
          current_url?: string | null
          default_url?: string | null
          description?: string | null
          display_order?: number | null
          fallback_emoji?: string | null
          icon_key?: string
          icon_label?: string
          icon_name?: string | null
          icon_type?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          lucide_name?: string | null
          platform?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_version_settings: {
        Row: {
          changelog: string | null
          created_at: string | null
          current_version: string
          current_version_code: number | null
          current_version_name: string | null
          force_update: boolean | null
          id: string
          is_maintenance: boolean | null
          maintenance_end_time: string | null
          maintenance_message: string | null
          min_version_code: number | null
          minimum_version: string
          platform: string
          play_store_url: string | null
          update_message: string | null
          update_url: string | null
          updated_at: string | null
        }
        Insert: {
          changelog?: string | null
          created_at?: string | null
          current_version: string
          current_version_code?: number | null
          current_version_name?: string | null
          force_update?: boolean | null
          id?: string
          is_maintenance?: boolean | null
          maintenance_end_time?: string | null
          maintenance_message?: string | null
          min_version_code?: number | null
          minimum_version: string
          platform: string
          play_store_url?: string | null
          update_message?: string | null
          update_url?: string | null
          updated_at?: string | null
        }
        Update: {
          changelog?: string | null
          created_at?: string | null
          current_version?: string
          current_version_code?: number | null
          current_version_name?: string | null
          force_update?: boolean | null
          id?: string
          is_maintenance?: boolean | null
          maintenance_end_time?: string | null
          maintenance_message?: string | null
          min_version_code?: number | null
          minimum_version?: string
          platform?: string
          play_store_url?: string | null
          update_message?: string | null
          update_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ar_stickers: {
        Row: {
          asset_url: string | null
          category: string | null
          coin_price: number | null
          created_at: string | null
          diamond_cost: number
          display_order: number | null
          file_url: string
          id: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean
          name: string
          preview_url: string | null
          slug: string | null
        }
        Insert: {
          asset_url?: string | null
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          diamond_cost?: number
          display_order?: number | null
          file_url: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean
          name: string
          preview_url?: string | null
          slug?: string | null
        }
        Update: {
          asset_url?: string | null
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          diamond_cost?: number
          display_order?: number | null
          file_url?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean
          name?: string
          preview_url?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      avatar_frames: {
        Row: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          frame_type: string | null
          frame_url: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean | null
          level_required: number | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          target_type: string | null
          updated_at: string | null
        }
        Insert: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          frame_type?: string | null
          frame_url?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          lottie_url?: string | null
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          target_type?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          frame_type?: string | null
          frame_url?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          lottie_url?: string | null
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          target_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      balance_audit_log: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          bypass_used: boolean | null
          column_name: string
          created_at: string
          delta: number | null
          id: string
          ip_address: string | null
          new_value: number | null
          old_value: number | null
          rpc_function: string | null
          table_name: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          bypass_used?: boolean | null
          column_name: string
          created_at?: string
          delta?: number | null
          id?: string
          ip_address?: string | null
          new_value?: number | null
          old_value?: number | null
          rpc_function?: string | null
          table_name: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          bypass_used?: boolean | null
          column_name?: string
          created_at?: string
          delta?: number | null
          id?: string
          ip_address?: string | null
          new_value?: number | null
          old_value?: number | null
          rpc_function?: string | null
          table_name?: string
          user_id?: string
        }
        Relationships: []
      }
      banned_devices: {
        Row: {
          banned_at: string
          banned_by: string | null
          device_id: string
          id: string
          is_active: boolean | null
          reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          device_id: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          device_id?: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      banned_face_hashes: {
        Row: {
          banned_at: string
          banned_by: string | null
          face_hash: string
          id: string
          is_active: boolean
          reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          face_hash: string
          id?: string
          is_active?: boolean
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          face_hash?: string
          id?: string
          is_active?: boolean
          reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      banned_ips: {
        Row: {
          banned_by: string | null
          created_at: string | null
          id: string
          ip_address: string
          is_active: boolean | null
          reason: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          banned_by?: string | null
          created_at?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
          reason?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          banned_by?: string | null
          created_at?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
          reason?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banned_ips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banned_ips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      banners: {
        Row: {
          accent_color: string | null
          background_color: string | null
          banner_type: string | null
          click_action: string | null
          created_at: string | null
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_type: string | null
          link_url: string | null
          location: string | null
          start_date: string | null
          subtitle: string | null
          target_data: Json | null
          text_color: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          banner_type?: string | null
          click_action?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          location?: string | null
          start_date?: string | null
          subtitle?: string | null
          target_data?: Json | null
          text_color?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          banner_type?: string | null
          click_action?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          location?: string | null
          start_date?: string | null
          subtitle?: string | null
          target_data?: Json | null
          text_color?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      beauty_filters: {
        Row: {
          category: string | null
          coin_price: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          file_url: string
          filter_key: string | null
          filter_type: string | null
          icon_name: string | null
          id: string
          intensity_default: number | null
          is_active: boolean | null
          is_free: boolean | null
          matrix: Json | null
          name: string
          preview_url: string | null
          slug: string | null
        }
        Insert: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          file_url: string
          filter_key?: string | null
          filter_type?: string | null
          icon_name?: string | null
          id?: string
          intensity_default?: number | null
          is_active?: boolean | null
          is_free?: boolean | null
          matrix?: Json | null
          name: string
          preview_url?: string | null
          slug?: string | null
        }
        Update: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          file_url?: string
          filter_key?: string | null
          filter_type?: string | null
          icon_name?: string | null
          id?: string
          intensity_default?: number | null
          is_active?: boolean | null
          is_free?: boolean | null
          matrix?: Json | null
          name?: string
          preview_url?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          expires_at: string | null
          id: string
          ip_address: string
          is_active: boolean | null
          is_permanent: boolean | null
          reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
          is_permanent?: boolean | null
          reason?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      call_delivery_log: {
        Row: {
          attempt_number: number
          call_id: string
          callee_id: string
          channel: string
          created_at: string
          delivered_at: string | null
          device_info: Json | null
          error_message: string | null
          fcm_token: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          attempt_number?: number
          call_id: string
          callee_id: string
          channel: string
          created_at?: string
          delivered_at?: string | null
          device_info?: Json | null
          error_message?: string | null
          fcm_token?: string | null
          id?: string
          sent_at?: string | null
          status: string
        }
        Update: {
          attempt_number?: number
          call_id?: string
          callee_id?: string
          channel?: string
          created_at?: string
          delivered_at?: string | null
          device_info?: Json | null
          error_message?: string | null
          fcm_token?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: []
      }
      call_events: {
        Row: {
          call_id: string | null
          call_type: string | null
          caller_id: string
          coin_cost: number | null
          duration: number | null
          ended_at: string | null
          event_data: Json | null
          event_type: string | null
          id: string
          receiver_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          call_id?: string | null
          call_type?: string | null
          caller_id: string
          coin_cost?: number | null
          duration?: number | null
          ended_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string
          receiver_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          call_id?: string | null
          call_type?: string | null
          caller_id?: string
          coin_cost?: number | null
          duration?: number | null
          ended_at?: string | null
          event_data?: Json | null
          event_type?: string | null
          id?: string
          receiver_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_live: boolean | null
          logo_url: string | null
          name: string
          stream_url: string | null
          viewer_count: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_live?: boolean | null
          logo_url?: string | null
          name: string
          stream_url?: string | null
          viewer_count?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_live?: boolean | null
          logo_url?: string | null
          name?: string
          stream_url?: string | null
          viewer_count?: number | null
        }
        Relationships: []
      }
      chat_bubbles: {
        Row: {
          created_at: string
          display_order: number
          duration_days: number | null
          id: string
          is_active: boolean
          lottie_url: string | null
          min_level: number
          name: string
          preview_url: string | null
          price_diamonds: number
          svga_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          id?: string
          is_active?: boolean
          lottie_url?: string | null
          min_level?: number
          name: string
          preview_url?: string | null
          price_diamonds?: number
          svga_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          id?: string
          is_active?: boolean
          lottie_url?: string | null
          min_level?: number
          name?: string
          preview_url?: string | null
          price_diamonds?: number
          svga_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_moderation_logs: {
        Row: {
          action_taken: string
          created_at: string | null
          detected_at: string | null
          id: string
          message_id: string | null
          original_content: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          user_id: string
          violation_type: string
        }
        Insert: {
          action_taken: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          message_id?: string | null
          original_content?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id: string
          violation_type: string
        }
        Update: {
          action_taken?: string
          created_at?: string | null
          detected_at?: string | null
          id?: string
          message_id?: string | null
          original_content?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id?: string
          violation_type?: string
        }
        Relationships: []
      }
      coin_packages: {
        Row: {
          bonus_coins: number | null
          coins_amount: number
          created_at: string | null
          description: string | null
          discount_percent: number | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          name: string
          price_usd: number
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          bonus_coins?: number | null
          coins_amount: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name: string
          price_usd: number
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bonus_coins?: number | null
          coins_amount?: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string
          price_usd?: number
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      coin_trader_transfers: {
        Row: {
          amount: number
          counterparty_agency_id: string | null
          counterparty_user_id: string | null
          created_at: string
          id: string
          status: string
          transfer_type: string
          user_id: string
        }
        Insert: {
          amount: number
          counterparty_agency_id?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          id?: string
          status?: string
          transfer_type: string
          user_id: string
        }
        Update: {
          amount?: number
          counterparty_agency_id?: string | null
          counterparty_user_id?: string | null
          created_at?: string
          id?: string
          status?: string
          transfer_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coin_trader_transfers_counterparty_agency_id_fkey"
            columns: ["counterparty_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_trader_transfers_counterparty_agency_id_fkey"
            columns: ["counterparty_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_trader_transfers_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coin_trader_transfers_counterparty_user_id_fkey"
            columns: ["counterparty_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_transactions: {
        Row: {
          coins_amount: number
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          status: string | null
          transaction_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          coins_amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          coins_amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          status?: string | null
          transaction_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      coin_transfers: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          receiver_id: string
          sender_id: string
          status: string | null
          transfer_type: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          receiver_id: string
          sender_id: string
          status?: string | null
          transfer_type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string | null
          transfer_type?: string | null
        }
        Relationships: []
      }
      consumption_return_config: {
        Row: {
          created_at: string | null
          display_order: number
          id: string
          is_active: boolean | null
          max_consumption: number | null
          max_return_coins: number | null
          max_spend: number | null
          min_consumption: number
          min_spend: number
          period_type: string
          return_percentage: number
          tier_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          max_consumption?: number | null
          max_return_coins?: number | null
          max_spend?: number | null
          min_consumption?: number
          min_spend?: number
          period_type?: string
          return_percentage?: number
          tier_name?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number
          id?: string
          is_active?: boolean | null
          max_consumption?: number | null
          max_return_coins?: number | null
          max_spend?: number | null
          min_consumption?: number
          min_spend?: number
          period_type?: string
          return_percentage?: number
          tier_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      consumption_return_history: {
        Row: {
          consumption_amount: number
          created_at: string | null
          id: string
          is_claimed: boolean | null
          period_end: string
          period_start: string
          return_amount: number
          return_percentage: number
          user_id: string
        }
        Insert: {
          consumption_amount: number
          created_at?: string | null
          id?: string
          is_claimed?: boolean | null
          period_end: string
          period_start: string
          return_amount: number
          return_percentage: number
          user_id: string
        }
        Update: {
          consumption_amount?: number
          created_at?: string | null
          id?: string
          is_claimed?: boolean | null
          period_end?: string
          period_start?: string
          return_amount?: number
          return_percentage?: number
          user_id?: string
        }
        Relationships: []
      }
      content_audio_tracks: {
        Row: {
          artist: string | null
          audio_url: string
          category: string | null
          created_at: string | null
          display_order: number | null
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          artist?: string | null
          audio_url: string
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          artist?: string | null
          audio_url?: string
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      content_subtitles: {
        Row: {
          content_id: string
          created_at: string | null
          id: string
          is_default: boolean | null
          language_code: string
          subtitle_url: string
        }
        Insert: {
          content_id: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          language_code?: string
          subtitle_url: string
        }
        Update: {
          content_id?: string
          created_at?: string | null
          id?: string
          is_default?: boolean | null
          language_code?: string
          subtitle_url?: string
        }
        Relationships: []
      }
      conversation_encryption_keys: {
        Row: {
          conversation_id: string
          created_at: string | null
          encrypted_key: string
          expires_at: string | null
          id: string
          key_version: number | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          encrypted_key: string
          expires_at?: string | null
          id?: string
          key_version?: number | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          encrypted_key?: string
          expires_at?: string | null
          id?: string
          key_version?: number | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          is_encrypted: boolean | null
          last_message: string | null
          last_message_at: string | null
          participant1_id: string
          participant2_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_encrypted?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          participant1_id: string
          participant2_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_encrypted?: boolean | null
          last_message?: string | null
          last_message_at?: string | null
          participant1_id?: string
          participant2_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      currency_rates: {
        Row: {
          country_code: string | null
          country_flag: string | null
          country_name: string | null
          created_at: string | null
          currency_code: string
          currency_symbol: string | null
          id: string
          is_active: boolean | null
          rate_to_usd: number
          updated_at: string | null
        }
        Insert: {
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          created_at?: string | null
          currency_code: string
          currency_symbol?: string | null
          id?: string
          is_active?: boolean | null
          rate_to_usd: number
          updated_at?: string | null
        }
        Update: {
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          created_at?: string | null
          currency_code?: string
          currency_symbol?: string | null
          id?: string
          is_active?: boolean | null
          rate_to_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_login_claims: {
        Row: {
          claimed_at: string | null
          claimed_date: string | null
          created_at: string | null
          day_number: number
          id: string
          reward_amount: number
          reward_id: string
          reward_type: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_date?: string | null
          created_at?: string | null
          day_number: number
          id?: string
          reward_amount: number
          reward_id: string
          reward_type: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          claimed_date?: string | null
          created_at?: string | null
          day_number?: number
          id?: string
          reward_amount?: number
          reward_id?: string
          reward_type?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_login_rewards_config: {
        Row: {
          bonus_label: string | null
          created_at: string | null
          day_number: number
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          reward_amount: number
          reward_coins: number
          reward_diamonds: number
          reward_type: string
        }
        Insert: {
          bonus_label?: string | null
          created_at?: string | null
          day_number: number
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          reward_amount: number
          reward_coins?: number
          reward_diamonds?: number
          reward_type: string
        }
        Update: {
          bonus_label?: string | null
          created_at?: string | null
          day_number?: number
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          reward_amount?: number
          reward_coins?: number
          reward_diamonds?: number
          reward_type?: string
        }
        Relationships: []
      }
      daily_tasks: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_hours: number | null
          icon_color: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          min_level: number | null
          mission_bucket: string
          required_count: number | null
          requirement_type: string | null
          requirement_value: number | null
          reward_beans: number | null
          reward_coins: number | null
          reward_xp: number | null
          target_audience: string | null
          target_gender: string | null
          task_type: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_hours?: number | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          mission_bucket?: string
          required_count?: number | null
          requirement_type?: string | null
          requirement_value?: number | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_xp?: number | null
          target_audience?: string | null
          target_gender?: string | null
          task_type: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_hours?: number | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          mission_bucket?: string
          required_count?: number | null
          requirement_type?: string | null
          requirement_value?: number | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_xp?: number | null
          target_audience?: string | null
          target_gender?: string | null
          task_type?: string
          title?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          platform: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          platform?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          platform?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      diamond_exchange_packages: {
        Row: {
          beans_amount: number
          created_at: string | null
          diamonds_reward: number
          display_order: number | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          beans_amount?: number
          created_at?: string | null
          diamonds_reward?: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          beans_amount?: number
          created_at?: string | null
          diamonds_reward?: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      email_otps: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
          purpose: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
          purpose?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
          purpose?: string | null
        }
        Relationships: []
      }
      entertainment: {
        Row: {
          category_id: string | null
          content_url: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          thumbnail_url: string | null
          title: string
          type: string
          view_count: number | null
        }
        Insert: {
          category_id?: string | null
          content_url: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title: string
          type: string
          view_count?: number | null
        }
        Update: {
          category_id?: string | null
          content_url?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title?: string
          type?: string
          view_count?: number | null
        }
        Relationships: []
      }
      entry_banners: {
        Row: {
          animation_url: string | null
          created_at: string | null
          display_order: number | null
          duration: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_premium: boolean | null
          level_required: number | null
          name: string
          price_coins: number | null
          price_diamonds: number | null
          sound_url: string | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          display_order?: number | null
          duration?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name: string
          price_coins?: number | null
          price_diamonds?: number | null
          sound_url?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          display_order?: number | null
          duration?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name?: string
          price_coins?: number | null
          price_diamonds?: number | null
          sound_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      entry_effects: {
        Row: {
          created_at: string
          display_order: number
          duration_days: number | null
          id: string
          is_active: boolean
          lottie_url: string | null
          min_level: number
          name: string
          preview_url: string | null
          price_diamonds: number
          svga_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          id?: string
          is_active?: boolean
          lottie_url?: string | null
          min_level?: number
          name: string
          preview_url?: string | null
          price_diamonds?: number
          svga_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          duration_days?: number | null
          id?: string
          is_active?: boolean
          lottie_url?: string | null
          min_level?: number
          name?: string
          preview_url?: string | null
          price_diamonds?: number
          svga_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      entry_name_bars: {
        Row: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_ms: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_premium: boolean | null
          level_required: number | null
          min_level: number | null
          min_vip_tier: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          min_level?: number | null
          min_vip_tier?: number | null
          name: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          min_level?: number | null
          min_vip_tier?: number | null
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      face_records: {
        Row: {
          created_at: string | null
          face_data: Json | null
          face_image_url: string
          id: string
          is_verified: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          face_data?: Json | null
          face_image_url: string
          id?: string
          is_verified?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          face_data?: Json | null
          face_image_url?: string
          id?: string
          is_verified?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      face_verification_submissions: {
        Row: {
          admin_notes: string | null
          age: number | null
          ai_analysis: Json | null
          confidence_score: number | null
          created_at: string | null
          device_id: string | null
          duplicate_face_avatar: string | null
          duplicate_face_name: string | null
          duplicate_face_uid: string | null
          duplicate_face_user_id: string | null
          duplicate_of_user_id: string | null
          face_image_url: string | null
          face_rekognition_id: string | null
          front_url: string | null
          full_name: string | null
          host_photos: string[] | null
          id: string
          ip_hash: string | null
          is_duplicate_face: boolean | null
          language: string | null
          left_url: string | null
          match_confidence: number | null
          notes: string | null
          profile_photo_url: string | null
          reference_image_url: string | null
          rejection_reason: string | null
          rekognition_confidence: number | null
          rekognition_external_id: string | null
          rekognition_external_image_id: string | null
          rekognition_face_id: string | null
          rekognition_indexed_at: string | null
          rekognition_shard_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          right_url: string | null
          selfie_url: string
          status: string | null
          user_id: string
          verification_method: string | null
          verification_type: string | null
          video_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          age?: number | null
          ai_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          device_id?: string | null
          duplicate_face_avatar?: string | null
          duplicate_face_name?: string | null
          duplicate_face_uid?: string | null
          duplicate_face_user_id?: string | null
          duplicate_of_user_id?: string | null
          face_image_url?: string | null
          face_rekognition_id?: string | null
          front_url?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          ip_hash?: string | null
          is_duplicate_face?: boolean | null
          language?: string | null
          left_url?: string | null
          match_confidence?: number | null
          notes?: string | null
          profile_photo_url?: string | null
          reference_image_url?: string | null
          rejection_reason?: string | null
          rekognition_confidence?: number | null
          rekognition_external_id?: string | null
          rekognition_external_image_id?: string | null
          rekognition_face_id?: string | null
          rekognition_indexed_at?: string | null
          rekognition_shard_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          right_url?: string | null
          selfie_url: string
          status?: string | null
          user_id: string
          verification_method?: string | null
          verification_type?: string | null
          video_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          age?: number | null
          ai_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          device_id?: string | null
          duplicate_face_avatar?: string | null
          duplicate_face_name?: string | null
          duplicate_face_uid?: string | null
          duplicate_face_user_id?: string | null
          duplicate_of_user_id?: string | null
          face_image_url?: string | null
          face_rekognition_id?: string | null
          front_url?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          ip_hash?: string | null
          is_duplicate_face?: boolean | null
          language?: string | null
          left_url?: string | null
          match_confidence?: number | null
          notes?: string | null
          profile_photo_url?: string | null
          reference_image_url?: string | null
          rejection_reason?: string | null
          rekognition_confidence?: number | null
          rekognition_external_id?: string | null
          rekognition_external_image_id?: string | null
          rekognition_face_id?: string | null
          rekognition_indexed_at?: string | null
          rekognition_shard_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          right_url?: string | null
          selfie_url?: string
          status?: string | null
          user_id?: string
          verification_method?: string | null
          verification_type?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_verification_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_verification_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      failed_login_attempts: {
        Row: {
          attempt_at: string
          attempt_type: string | null
          id: string
          identifier: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_at?: string
          attempt_type?: string | null
          id?: string
          identifier: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_at?: string
          attempt_type?: string | null
          id?: string
          identifier?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      feature_level_requirements: {
        Row: {
          created_at: string | null
          description: string | null
          feature_key: string
          id: string
          is_active: boolean | null
          min_level: number | null
          min_vip_level: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          feature_key: string
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          min_vip_level?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          feature_key?: string
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          min_vip_level?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      first_recharge_bonus: {
        Row: {
          banner_image_url: string | null
          banner_subtitle: string | null
          banner_title: string | null
          banner_type: string | null
          bonus_coins: number
          bonus_label: string | null
          bonus_multiplier: number | null
          bonus_percentage: number
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          banner_image_url?: string | null
          banner_subtitle?: string | null
          banner_title?: string | null
          banner_type?: string | null
          bonus_coins?: number
          bonus_label?: string | null
          bonus_multiplier?: number | null
          bonus_percentage?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          banner_image_url?: string | null
          banner_subtitle?: string | null
          banner_title?: string | null
          banner_type?: string | null
          bonus_coins?: number
          bonus_label?: string | null
          bonus_multiplier?: number | null
          bonus_percentage?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Relationships: []
      }
      first_recharge_claims: {
        Row: {
          bonus_amount: number
          bonus_id: string
          claimed_at: string | null
          id: string
          original_amount: number
          user_id: string
        }
        Insert: {
          bonus_amount: number
          bonus_id: string
          claimed_at?: string | null
          id?: string
          original_amount: number
          user_id: string
        }
        Update: {
          bonus_amount?: number
          bonus_id?: string
          claimed_at?: string | null
          id?: string
          original_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      followers: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: []
      }
      game_bets: {
        Row: {
          bet_amount: number
          bet_type: string
          bet_value: string | null
          created_at: string | null
          game_id: string
          id: string
          payout: number | null
          player_id: string
          result: string | null
        }
        Insert: {
          bet_amount: number
          bet_type: string
          bet_value?: string | null
          created_at?: string | null
          game_id: string
          id?: string
          payout?: number | null
          player_id: string
          result?: string | null
        }
        Update: {
          bet_amount?: number
          bet_type?: string
          bet_value?: string | null
          created_at?: string | null
          game_id?: string
          id?: string
          payout?: number | null
          player_id?: string
          result?: string | null
        }
        Relationships: []
      }
      game_configs: {
        Row: {
          config_data: Json | null
          config_key: string
          config_value: Json
          created_at: string | null
          game_id: string | null
          game_type: string
          id: string
          is_active: boolean | null
          max_bet: number | null
          min_bet: number | null
          name: string | null
          updated_at: string | null
          win_multiplier: number | null
          win_probability: number | null
        }
        Insert: {
          config_data?: Json | null
          config_key: string
          config_value?: Json
          created_at?: string | null
          game_id?: string | null
          game_type: string
          id?: string
          is_active?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          name?: string | null
          updated_at?: string | null
          win_multiplier?: number | null
          win_probability?: number | null
        }
        Update: {
          config_data?: Json | null
          config_key?: string
          config_value?: Json
          created_at?: string | null
          game_id?: string | null
          game_type?: string
          id?: string
          is_active?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          name?: string | null
          updated_at?: string | null
          win_multiplier?: number | null
          win_probability?: number | null
        }
        Relationships: []
      }
      game_players: {
        Row: {
          game_id: string
          id: string
          joined_at: string | null
          score: number | null
          seat_number: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          game_id: string
          id?: string
          joined_at?: string | null
          score?: number | null
          seat_number?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          game_id?: string
          id?: string
          joined_at?: string | null
          score?: number | null
          seat_number?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      game_provider_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          provider_id: string
          request_data: Json | null
          response_data: Json | null
          status_code: number | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          provider_id: string
          request_data?: Json | null
          response_data?: Json | null
          status_code?: number | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          provider_id?: string
          request_data?: Json | null
          response_data?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      game_providers: {
        Row: {
          api_key_ref: string | null
          api_url: string
          config: Json | null
          created_at: string | null
          id: string
          is_active: boolean | null
          logo_url: string | null
          name: string
          slug: string
          supported_games: string[] | null
          updated_at: string | null
        }
        Insert: {
          api_key_ref?: string | null
          api_url: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name: string
          slug: string
          supported_games?: string[] | null
          updated_at?: string | null
        }
        Update: {
          api_key_ref?: string | null
          api_url?: string
          config?: Json | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          name?: string
          slug?: string
          supported_games?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      game_server_settings: {
        Row: {
          connection_timeout: number | null
          created_at: string | null
          heartbeat_interval: number | null
          id: string
          is_active: boolean | null
          max_connections: number | null
          server_name: string
          server_region: string | null
          server_url: string
          updated_at: string | null
        }
        Insert: {
          connection_timeout?: number | null
          created_at?: string | null
          heartbeat_interval?: number | null
          id?: string
          is_active?: boolean | null
          max_connections?: number | null
          server_name: string
          server_region?: string | null
          server_url: string
          updated_at?: string | null
        }
        Update: {
          connection_timeout?: number | null
          created_at?: string | null
          heartbeat_interval?: number | null
          id?: string
          is_active?: boolean | null
          max_connections?: number | null
          server_name?: string
          server_region?: string | null
          server_url?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      game_session_tokens: {
        Row: {
          balance_snapshot: number | null
          created_at: string | null
          expires_at: string | null
          game_id: string | null
          id: string
          is_active: boolean | null
          merchant_id: string
          room_id: string | null
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          balance_snapshot?: number | null
          created_at?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean | null
          merchant_id?: string
          room_id?: string | null
          token?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          balance_snapshot?: number | null
          created_at?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean | null
          merchant_id?: string
          room_id?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          created_by: string | null
          current_round: number | null
          ended_at: string | null
          game_data: Json | null
          game_type: string
          id: string
          max_players: number | null
          room_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          created_by?: string | null
          current_round?: number | null
          ended_at?: string | null
          game_data?: Json | null
          game_type: string
          id?: string
          max_players?: number | null
          room_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          created_by?: string | null
          current_round?: number | null
          ended_at?: string | null
          game_data?: Json | null
          game_type?: string
          id?: string
          max_players?: number | null
          room_id?: string
          started_at?: string | null
          status?: string | null
        }
        Relationships: []
      }
      game_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          game_color: string | null
          game_emoji: string | null
          game_id: string | null
          game_name: string | null
          game_type: string
          game_url: string | null
          house_edge: number | null
          id: string
          iframe_height: number | null
          iframe_width: number | null
          is_active: boolean | null
          is_featured: boolean | null
          jackpot_multiplier: number | null
          jackpot_percentage: number | null
          logo_url: string | null
          max_bet: number | null
          max_multiplier: number | null
          max_win_probability: number | null
          min_bet: number | null
          min_win_probability: number | null
          preset_bets: Json | null
          provider_game_code: string | null
          provider_id: string | null
          rules: Json | null
          setting_key: string
          setting_value: Json | null
          updated_at: string | null
          win_probability: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_color?: string | null
          game_emoji?: string | null
          game_id?: string | null
          game_name?: string | null
          game_type: string
          game_url?: string | null
          house_edge?: number | null
          id?: string
          iframe_height?: number | null
          iframe_width?: number | null
          is_active?: boolean | null
          is_featured?: boolean | null
          jackpot_multiplier?: number | null
          jackpot_percentage?: number | null
          logo_url?: string | null
          max_bet?: number | null
          max_multiplier?: number | null
          max_win_probability?: number | null
          min_bet?: number | null
          min_win_probability?: number | null
          preset_bets?: Json | null
          provider_game_code?: string | null
          provider_id?: string | null
          rules?: Json | null
          setting_key: string
          setting_value?: Json | null
          updated_at?: string | null
          win_probability?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_color?: string | null
          game_emoji?: string | null
          game_id?: string | null
          game_name?: string | null
          game_type?: string
          game_url?: string | null
          house_edge?: number | null
          id?: string
          iframe_height?: number | null
          iframe_width?: number | null
          is_active?: boolean | null
          is_featured?: boolean | null
          jackpot_multiplier?: number | null
          jackpot_percentage?: number | null
          logo_url?: string | null
          max_bet?: number | null
          max_multiplier?: number | null
          max_win_probability?: number | null
          min_bet?: number | null
          min_win_probability?: number | null
          preset_bets?: Json | null
          provider_game_code?: string | null
          provider_id?: string | null
          rules?: Json | null
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string | null
          win_probability?: number | null
        }
        Relationships: []
      }
      game_stats: {
        Row: {
          game_type: string
          highest_score: number | null
          id: string
          total_coins_lost: number | null
          total_coins_won: number | null
          total_games: number | null
          total_wins: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          game_type: string
          highest_score?: number | null
          id?: string
          total_coins_lost?: number | null
          total_coins_won?: number | null
          total_games?: number | null
          total_wins?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          game_type?: string
          highest_score?: number | null
          id?: string
          total_coins_lost?: number | null
          total_coins_won?: number | null
          total_games?: number | null
          total_wins?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      game_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          bet_amount: number | null
          created_at: string | null
          game_id: string | null
          game_session_id: string | null
          game_type: string
          id: string
          is_win: boolean | null
          result_data: Json | null
          transaction_type: string
          user_id: string
          win_amount: number | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          bet_amount?: number | null
          created_at?: string | null
          game_id?: string | null
          game_session_id?: string | null
          game_type: string
          id?: string
          is_win?: boolean | null
          result_data?: Json | null
          transaction_type: string
          user_id: string
          win_amount?: number | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          bet_amount?: number | null
          created_at?: string | null
          game_id?: string | null
          game_session_id?: string | null
          game_type?: string
          id?: string
          is_win?: boolean | null
          result_data?: Json | null
          transaction_type?: string
          user_id?: string
          win_amount?: number | null
        }
        Relationships: []
      }
      gift_categories: {
        Row: {
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      gift_transaction_logs: {
        Row: {
          created_at: string | null
          gift_id: string
          id: string
          quantity: number | null
          receiver_id: string
          room_id: string | null
          sender_id: string
          stream_id: string | null
          total_coins: number
          transaction_id: string
          transaction_type: string | null
        }
        Insert: {
          created_at?: string | null
          gift_id: string
          id?: string
          quantity?: number | null
          receiver_id: string
          room_id?: string | null
          sender_id: string
          stream_id?: string | null
          total_coins: number
          transaction_id: string
          transaction_type?: string | null
        }
        Update: {
          created_at?: string | null
          gift_id?: string
          id?: string
          quantity?: number | null
          receiver_id?: string
          room_id?: string | null
          sender_id?: string
          stream_id?: string | null
          total_coins?: number
          transaction_id?: string
          transaction_type?: string | null
        }
        Relationships: []
      }
      gift_transactions: {
        Row: {
          call_id: string | null
          coin_amount: number
          coin_cost: number | null
          coin_value: number | null
          created_at: string | null
          diamond_cost: number | null
          gift_id: string | null
          id: string
          party_room_id: string | null
          quantity: number | null
          receiver_beans: number | null
          receiver_id: string | null
          reel_id: string | null
          room_id: string | null
          sender_id: string | null
          sender_type: string | null
          stream_id: string | null
        }
        Insert: {
          call_id?: string | null
          coin_amount: number
          coin_cost?: number | null
          coin_value?: number | null
          created_at?: string | null
          diamond_cost?: number | null
          gift_id?: string | null
          id?: string
          party_room_id?: string | null
          quantity?: number | null
          receiver_beans?: number | null
          receiver_id?: string | null
          reel_id?: string | null
          room_id?: string | null
          sender_id?: string | null
          sender_type?: string | null
          stream_id?: string | null
        }
        Update: {
          call_id?: string | null
          coin_amount?: number
          coin_cost?: number | null
          coin_value?: number | null
          created_at?: string | null
          diamond_cost?: number | null
          gift_id?: string | null
          id?: string
          party_room_id?: string | null
          quantity?: number | null
          receiver_beans?: number | null
          receiver_id?: string | null
          reel_id?: string | null
          room_id?: string | null
          sender_id?: string | null
          sender_type?: string | null
          stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      gifts: {
        Row: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          category_id: string | null
          coin_price: number | null
          coin_value: number
          created_at: string | null
          display_order: number | null
          duration_days: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_full_screen: boolean | null
          is_lucky: boolean | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          receiver_beans: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          tier: number
        }
        Insert: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_price?: number | null
          coin_value: number
          created_at?: string | null
          display_order?: number | null
          duration_days?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_full_screen?: boolean | null
          is_lucky?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number | null
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tier?: number
        }
        Update: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_price?: number | null
          coin_value?: number
          created_at?: string | null
          display_order?: number | null
          duration_days?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_full_screen?: boolean | null
          is_lucky?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number | null
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tier?: number
        }
        Relationships: []
      }
      group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      group_messages: {
        Row: {
          content: string
          created_at: string | null
          group_id: string
          id: string
          message_type: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          group_id: string
          id?: string
          message_type?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          group_id?: string
          id?: string
          message_type?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          max_members: number | null
          name: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          name: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          max_members?: number | null
          name?: string
        }
        Relationships: []
      }
      help_articles: {
        Row: {
          body: string
          category_slug: string
          created_at: string
          display_order: number
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category_slug: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category_slug?: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      helper_accepted_payment_methods: {
        Row: {
          created_at: string
          gateway_id: string
          helper_id: string
          id: string
          is_enabled: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          gateway_id: string
          helper_id: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          gateway_id?: string
          helper_id?: string
          id?: string
          is_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_accepted_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_accepted_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_accepted_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_admin_messages: {
        Row: {
          created_at: string | null
          helper_id: string
          id: string
          is_read: boolean | null
          message: string
          message_type: string | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          helper_id: string
          id?: string
          is_read?: boolean | null
          message: string
          message_type?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Update: {
          created_at?: string | null
          helper_id?: string
          id?: string
          is_read?: boolean | null
          message?: string
          message_type?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_admin_messages_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_admin_messages_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_admin_messages_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_applications: {
        Row: {
          country_code: string
          created_at: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          whatsapp_number: string
        }
        Insert: {
          country_code: string
          created_at?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          whatsapp_number: string
        }
        Update: {
          country_code?: string
          created_at?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_assigned_countries: {
        Row: {
          assigned_at: string | null
          country_code: string
          country_name: string
          helper_id: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          assigned_at?: string | null
          country_code: string
          country_name: string
          helper_id: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          assigned_at?: string | null
          country_code?: string
          country_name?: string
          helper_id?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: []
      }
      helper_country_payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          additional_info: Json | null
          bank_name: string | null
          country_code: string
          country_name: string
          created_at: string | null
          display_order: number | null
          helper_id: string | null
          icon_url: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          logo_url: string | null
          method_name: string | null
          method_type: string | null
          payment_method_name: string
          payment_type: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: Json | null
          bank_name?: string | null
          country_code: string
          country_name: string
          created_at?: string | null
          display_order?: number | null
          helper_id?: string | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          method_name?: string | null
          method_type?: string | null
          payment_method_name: string
          payment_type?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: Json | null
          bank_name?: string | null
          country_code?: string
          country_name?: string
          created_at?: string | null
          display_order?: number | null
          helper_id?: string | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          method_name?: string | null
          method_type?: string | null
          payment_method_name?: string
          payment_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_country_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_country_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_country_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_diamond_packages: {
        Row: {
          created_at: string | null
          description: string | null
          diamond_amount: number
          display_order: number | null
          id: string
          is_active: boolean | null
          local_prices: Json | null
          price_usd: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          diamond_amount: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          local_prices?: Json | null
          price_usd: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          diamond_amount?: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          local_prices?: Json | null
          price_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      helper_level_config: {
        Row: {
          badge_color: string | null
          badge_icon: string | null
          commission_rate: number
          created_at: string | null
          id: string
          is_active: boolean | null
          is_enabled: boolean | null
          level: number
          level_name: string
          level_number: number | null
          min_total_diamonds: number
          perks: Json | null
          updated_at: string | null
        }
        Insert: {
          badge_color?: string | null
          badge_icon?: string | null
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          level: number
          level_name: string
          level_number?: number | null
          min_total_diamonds?: number
          perks?: Json | null
          updated_at?: string | null
        }
        Update: {
          badge_color?: string | null
          badge_icon?: string | null
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_enabled?: boolean | null
          level?: number
          level_name?: string
          level_number?: number | null
          min_total_diamonds?: number
          perks?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      helper_message_replies: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message_id: string
          reply_text: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id: string
          reply_text: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id?: string
          reply_text?: string
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: []
      }
      helper_notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          helper_id: string
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          helper_id: string
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          helper_id?: string
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      helper_orders: {
        Row: {
          amount_local: number | null
          amount_usd: number | null
          coin_amount: number | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          currency_code: string | null
          customer_id: string | null
          diamond_amount: number | null
          helper_id: string
          id: string
          local_currency: string | null
          local_price: number | null
          notes: string | null
          package_id: string
          payment_details: Json
          payment_method: string | null
          payment_proof_url: string | null
          processed_at: string | null
          processing_time_minutes: number | null
          status: string | null
          total_price_usd: number | null
          updated_at: string | null
          user_country_code: string | null
          user_id: string | null
          user_payment_proof: string | null
        }
        Insert: {
          amount_local?: number | null
          amount_usd?: number | null
          coin_amount?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency_code?: string | null
          customer_id?: string | null
          diamond_amount?: number | null
          helper_id: string
          id?: string
          local_currency?: string | null
          local_price?: number | null
          notes?: string | null
          package_id: string
          payment_details?: Json
          payment_method?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processing_time_minutes?: number | null
          status?: string | null
          total_price_usd?: number | null
          updated_at?: string | null
          user_country_code?: string | null
          user_id?: string | null
          user_payment_proof?: string | null
        }
        Update: {
          amount_local?: number | null
          amount_usd?: number | null
          coin_amount?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          currency_code?: string | null
          customer_id?: string | null
          diamond_amount?: number | null
          helper_id?: string
          id?: string
          local_currency?: string | null
          local_price?: number | null
          notes?: string | null
          package_id?: string
          payment_details?: Json
          payment_method?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processing_time_minutes?: number | null
          status?: string | null
          total_price_usd?: number | null
          updated_at?: string | null
          user_country_code?: string | null
          user_id?: string | null
          user_payment_proof?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_orders_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_user_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_payment_methods: {
        Row: {
          account_name: string
          account_number: string
          additional_info: Json | null
          created_at: string | null
          helper_id: string
          id: string
          is_active: boolean | null
          is_primary: boolean | null
          method_type: string
        }
        Insert: {
          account_name: string
          account_number: string
          additional_info?: Json | null
          created_at?: string | null
          helper_id: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          method_type: string
        }
        Update: {
          account_name?: string
          account_number?: string
          additional_info?: Json | null
          created_at?: string | null
          helper_id?: string
          id?: string
          is_active?: boolean | null
          is_primary?: boolean | null
          method_type?: string
        }
        Relationships: []
      }
      helper_topup_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          helper_id: string
          id: string
          payment_method: string | null
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          helper_id: string
          id?: string
          payment_method?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          helper_id?: string
          id?: string
          payment_method?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_topup_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_topup_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_topup_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string | null
          description: string | null
          helper_id: string
          id: string
          reference_id: string | null
          transaction_type: string
          user_id: string | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          description?: string | null
          helper_id: string
          id?: string
          reference_id?: string | null
          transaction_type: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          description?: string | null
          helper_id?: string
          id?: string
          reference_id?: string | null
          transaction_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_transactions_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_upgrade_requests: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          current_level: number | null
          helper_id: string
          id: string
          requested_level: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          current_level?: number | null
          helper_id: string
          id?: string
          requested_level: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          current_level?: number | null
          helper_id?: string
          id?: string
          requested_level?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_upgrade_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_upgrade_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_upgrade_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          approved_at: string | null
          beans_amount: number | null
          created_at: string | null
          currency_code: string
          diamond_reward: number
          helper_id: string
          helper_net_reward: number
          helper_notes: string | null
          host_id: string | null
          id: string
          local_amount: number
          payment_details: Json
          payment_method_id: string | null
          payment_screenshot_url: string | null
          platform_fee_amount: number
          processed_at: string | null
          processed_by: string | null
          status: string | null
          updated_at: string | null
          usd_amount: number
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          approved_at?: string | null
          beans_amount?: number | null
          created_at?: string | null
          currency_code?: string
          diamond_reward?: number
          helper_id: string
          helper_net_reward?: number
          helper_notes?: string | null
          host_id?: string | null
          id?: string
          local_amount?: number
          payment_details?: Json
          payment_method_id?: string | null
          payment_screenshot_url?: string | null
          platform_fee_amount?: number
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          updated_at?: string | null
          usd_amount?: number
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          approved_at?: string | null
          beans_amount?: number | null
          created_at?: string | null
          currency_code?: string
          diamond_reward?: number
          helper_id?: string
          helper_net_reward?: number
          helper_notes?: string | null
          host_id?: string | null
          id?: string
          local_amount?: number
          payment_details?: Json
          payment_method_id?: string | null
          payment_screenshot_url?: string | null
          platform_fee_amount?: number
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          updated_at?: string | null
          usd_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "helper_withdrawal_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "coin_traders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_withdrawal_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_withdrawal_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_withdrawal_requests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_withdrawal_requests_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      host_applications: {
        Row: {
          admin_notes: string | null
          age: number
          ai_analysis: Json | null
          country: string | null
          created_at: string | null
          current_step: number | null
          face_match_score: number | null
          face_verification_id: string | null
          face_verification_image_url: string | null
          face_verification_status: string | null
          full_name: string | null
          host_photos: string[] | null
          id: string
          is_complete: boolean | null
          language: string[] | null
          notes: string | null
          photo_url: string | null
          real_name: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          user_id: string
          video_duration_seconds: number | null
          video_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          age: number
          ai_analysis?: Json | null
          country?: string | null
          created_at?: string | null
          current_step?: number | null
          face_match_score?: number | null
          face_verification_id?: string | null
          face_verification_image_url?: string | null
          face_verification_status?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          is_complete?: boolean | null
          language?: string[] | null
          notes?: string | null
          photo_url?: string | null
          real_name: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          age?: number
          ai_analysis?: Json | null
          country?: string | null
          created_at?: string | null
          current_step?: number | null
          face_match_score?: number | null
          face_verification_id?: string | null
          face_verification_image_url?: string | null
          face_verification_status?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          is_complete?: boolean | null
          language?: string[] | null
          notes?: string | null
          photo_url?: string | null
          real_name?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          user_id?: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      host_contact_violations: {
        Row: {
          action_taken: string | null
          created_at: string | null
          detected_content: string | null
          id: string
          is_false_positive: boolean | null
          reviewed_at: string | null
          reviewed_by: string | null
          room_id: string | null
          severity: string | null
          stream_id: string | null
          user_id: string
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          detected_content?: string | null
          id?: string
          is_false_positive?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string | null
          stream_id?: string | null
          user_id: string
          violation_type: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          detected_content?: string | null
          id?: string
          is_false_positive?: boolean | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          room_id?: string | null
          severity?: string | null
          stream_id?: string | null
          user_id?: string
          violation_type?: string
        }
        Relationships: []
      }
      host_conversion_requests: {
        Row: {
          beans_amount: number
          conversion_rate: number
          created_at: string | null
          diamond_amount: number
          host_id: string
          id: string
          notes: string | null
          processed_at: string | null
          processed_by: string | null
          status: string | null
        }
        Insert: {
          beans_amount: number
          conversion_rate: number
          created_at?: string | null
          diamond_amount: number
          host_id: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
        }
        Update: {
          beans_amount?: number
          conversion_rate?: number
          created_at?: string | null
          diamond_amount?: number
          host_id?: string
          id?: string
          notes?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
        }
        Relationships: []
      }
      host_levels: {
        Row: {
          badge_url: string | null
          beans_required: number | null
          color: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          level_name: string
          level_number: number
          min_beans: number
          perks: Json | null
        }
        Insert: {
          badge_url?: string | null
          beans_required?: number | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name: string
          level_number: number
          min_beans?: number
          perks?: Json | null
        }
        Update: {
          badge_url?: string | null
          beans_required?: number | null
          color?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name?: string
          level_number?: number
          min_beans?: number
          perks?: Json | null
        }
        Relationships: []
      }
      invitation_reward_claims: {
        Row: {
          claimed_at: string | null
          claimed_by: string
          id: string
          invitation_id: string
          reward_amount: number
          reward_type: string
        }
        Insert: {
          claimed_at?: string | null
          claimed_by: string
          id?: string
          invitation_id: string
          reward_amount: number
          reward_type: string
        }
        Update: {
          claimed_at?: string | null
          claimed_by?: string
          id?: string
          invitation_id?: string
          reward_amount?: number
          reward_type?: string
        }
        Relationships: []
      }
      invitation_reward_tiers: {
        Row: {
          badge_color: string | null
          badge_icon: string | null
          bonus_percentage: number | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          max_invites: number | null
          min_invites: number
          reward_beans: number | null
          reward_coins: number | null
          tier_name: string
          updated_at: string | null
        }
        Insert: {
          badge_color?: string | null
          badge_icon?: string | null
          bonus_percentage?: number | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_invites?: number | null
          min_invites?: number
          reward_beans?: number | null
          reward_coins?: number | null
          tier_name: string
          updated_at?: string | null
        }
        Update: {
          badge_color?: string | null
          badge_icon?: string | null
          bonus_percentage?: number | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          max_invites?: number | null
          min_invites?: number
          reward_beans?: number | null
          reward_coins?: number | null
          tier_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      invitation_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          setting_key: string
          setting_value: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          setting_key: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      iptv_sources: {
        Row: {
          category: string | null
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
          name: string
          url: string
        }
        Insert: {
          category?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name: string
          url: string
        }
        Update: {
          category?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name?: string
          url?: string
        }
        Relationships: []
      }
      kids_content: {
        Row: {
          age_range: string | null
          content_type: string | null
          content_url: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          age_range?: string | null
          content_type?: string | null
          content_url: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          age_range?: string | null
          content_type?: string | null
          content_url?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      landing_page_sections: {
        Row: {
          content: Json | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          media_url: string | null
          section_key: string
          section_type: string
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          section_key: string
          section_type?: string
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          media_url?: string | null
          section_key?: string
          section_type?: string
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_podium_frames: {
        Row: {
          animation_url: string | null
          badge_url: string | null
          category: string | null
          created_at: string | null
          frame_image_url: string
          glow_color: string | null
          id: string
          is_active: boolean | null
          leaderboard_type: string
          rank_position: number
        }
        Insert: {
          animation_url?: string | null
          badge_url?: string | null
          category?: string | null
          created_at?: string | null
          frame_image_url: string
          glow_color?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type: string
          rank_position: number
        }
        Update: {
          animation_url?: string | null
          badge_url?: string | null
          category?: string | null
          created_at?: string | null
          frame_image_url?: string
          glow_color?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type?: string
          rank_position?: number
        }
        Relationships: []
      }
      leaderboard_reward_config: {
        Row: {
          badge_url: string | null
          category: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          leaderboard_type: string
          period_type: string | null
          rank_from: number | null
          rank_position: number | null
          rank_to: number | null
          reward_amount: number
          reward_beans: number | null
          reward_coins: number | null
          reward_diamonds: number | null
          reward_type: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          badge_url?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type: string
          period_type?: string | null
          rank_from?: number | null
          rank_position?: number | null
          rank_to?: number | null
          reward_amount?: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          reward_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          badge_url?: string | null
          category?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type?: string
          period_type?: string | null
          rank_from?: number | null
          rank_position?: number | null
          rank_to?: number | null
          reward_amount?: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          reward_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_reward_history: {
        Row: {
          category: string | null
          claimed_at: string | null
          distributed_at: string | null
          id: string
          leaderboard_type: string
          period_end: string
          period_label: string | null
          period_start: string
          period_type: string | null
          rank_position: number
          reward_amount: number
          reward_beans: number | null
          reward_coins: number | null
          reward_diamonds: number | null
          reward_type: string
          sent_at: string | null
          stat_value: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          claimed_at?: string | null
          distributed_at?: string | null
          id?: string
          leaderboard_type: string
          period_end: string
          period_label?: string | null
          period_start: string
          period_type?: string | null
          rank_position: number
          reward_amount: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          reward_type: string
          sent_at?: string | null
          stat_value?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          claimed_at?: string | null
          distributed_at?: string | null
          id?: string
          leaderboard_type?: string
          period_end?: string
          period_label?: string | null
          period_start?: string
          period_type?: string | null
          rank_position?: number
          reward_amount?: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          reward_type?: string
          sent_at?: string | null
          stat_value?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      level_animations: {
        Row: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          level: number
          sound_url: string | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          sound_url?: string | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          sound_url?: string | null
        }
        Relationships: []
      }
      level_privileges: {
        Row: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_ms: number | null
          icon_bg_color: string | null
          icon_color: string | null
          icon_name: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level: number
          name: string | null
          preview_url: string | null
          privilege_key: string
          privilege_name: string
          privilege_type: string | null
          sound_url: string | null
          unlock_level: number | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          name?: string | null
          preview_url?: string | null
          privilege_key: string
          privilege_name: string
          privilege_type?: string | null
          sound_url?: string | null
          unlock_level?: number | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_name?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          name?: string | null
          preview_url?: string | null
          privilege_key?: string
          privilege_name?: string
          privilege_type?: string | null
          sound_url?: string | null
          unlock_level?: number | null
        }
        Relationships: []
      }
      limited_offer_claims: {
        Row: {
          amount_paid: number
          claimed_at: string | null
          coins_received: number
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          amount_paid: number
          claimed_at?: string | null
          coins_received: number
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          amount_paid?: number
          claimed_at?: string | null
          coins_received?: number
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      limited_time_offers: {
        Row: {
          coins_amount: number
          created_at: string | null
          description: string | null
          discount_percent: number | null
          ends_at: string
          icon_url: string | null
          id: string
          is_active: boolean | null
          max_claims: number | null
          offer_price: number
          original_price: number
          starts_at: string
          title: string
        }
        Insert: {
          coins_amount: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          ends_at: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          max_claims?: number | null
          offer_price: number
          original_price: number
          starts_at: string
          title: string
        }
        Update: {
          coins_amount?: number
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          ends_at?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          max_claims?: number | null
          offer_price?: number
          original_price?: number
          starts_at?: string
          title?: string
        }
        Relationships: []
      }
      live_bans: {
        Row: {
          auto_banned: boolean | null
          ban_duration_hours: number | null
          ban_end: string | null
          ban_reason: string | null
          ban_start: string | null
          ban_type: string | null
          banned_by: string | null
          created_at: string | null
          device_banned: boolean | null
          expires_at: string | null
          face_hash_banned: boolean | null
          id: string
          ip_banned: boolean | null
          is_active: boolean | null
          reason: string | null
          severity: string | null
          stream_id: string | null
          unban_reason: string | null
          unbanned_at: string | null
          unbanned_by: string | null
          user_id: string
          violation_type: string | null
          warning_count: number | null
        }
        Insert: {
          auto_banned?: boolean | null
          ban_duration_hours?: number | null
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          ban_type?: string | null
          banned_by?: string | null
          created_at?: string | null
          device_banned?: boolean | null
          expires_at?: string | null
          face_hash_banned?: boolean | null
          id?: string
          ip_banned?: boolean | null
          is_active?: boolean | null
          reason?: string | null
          severity?: string | null
          stream_id?: string | null
          unban_reason?: string | null
          unbanned_at?: string | null
          unbanned_by?: string | null
          user_id: string
          violation_type?: string | null
          warning_count?: number | null
        }
        Update: {
          auto_banned?: boolean | null
          ban_duration_hours?: number | null
          ban_end?: string | null
          ban_reason?: string | null
          ban_start?: string | null
          ban_type?: string | null
          banned_by?: string | null
          created_at?: string | null
          device_banned?: boolean | null
          expires_at?: string | null
          face_hash_banned?: boolean | null
          id?: string
          ip_banned?: boolean | null
          is_active?: boolean | null
          reason?: string | null
          severity?: string | null
          stream_id?: string | null
          unban_reason?: string | null
          unbanned_at?: string | null
          unbanned_by?: string | null
          user_id?: string
          violation_type?: string | null
          warning_count?: number | null
        }
        Relationships: []
      }
      live_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      live_face_violations: {
        Row: {
          action_taken: string | null
          confidence: number | null
          created_at: string | null
          frame_url: string | null
          host_id: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          stream_id: string
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          confidence?: number | null
          created_at?: string | null
          frame_url?: string | null
          host_id: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          stream_id: string
          violation_type: string
        }
        Update: {
          action_taken?: string | null
          confidence?: number | null
          created_at?: string | null
          frame_url?: string | null
          host_id?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          stream_id?: string
          violation_type?: string
        }
        Relationships: []
      }
      live_face_warnings: {
        Row: {
          device_info: Json
          duration_seconds: number
          event: string
          host_id: string
          id: string
          occurred_at: string
          session_type: string
          stream_id: string
        }
        Insert: {
          device_info?: Json
          duration_seconds?: number
          event: string
          host_id: string
          id?: string
          occurred_at?: string
          session_type?: string
          stream_id: string
        }
        Update: {
          device_info?: Json
          duration_seconds?: number
          event?: string
          host_id?: string
          id?: string
          occurred_at?: string
          session_type?: string
          stream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_face_warnings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_face_warnings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      live_game_bets: {
        Row: {
          bet_amount: number
          bet_choice: string
          created_at: string | null
          id: string
          payout: number | null
          round_id: string
          user_id: string
          won: boolean | null
        }
        Insert: {
          bet_amount: number
          bet_choice: string
          created_at?: string | null
          id?: string
          payout?: number | null
          round_id: string
          user_id: string
          won?: boolean | null
        }
        Update: {
          bet_amount?: number
          bet_choice?: string
          created_at?: string | null
          id?: string
          payout?: number | null
          round_id?: string
          user_id?: string
          won?: boolean | null
        }
        Relationships: []
      }
      live_game_rounds: {
        Row: {
          betting_end_at: string | null
          created_at: string | null
          created_by: string | null
          ended_at: string | null
          game_end_at: string | null
          game_id: string | null
          game_start_at: string | null
          game_type: string
          id: string
          result: string | null
          room_id: string | null
          round_number: number | null
          started_at: string | null
          status: string | null
          stream_id: string
          total_bet_amount: number | null
          total_bets: number | null
          total_players: number | null
          total_pool: number | null
          winning_value: string | null
        }
        Insert: {
          betting_end_at?: string | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          game_end_at?: string | null
          game_id?: string | null
          game_start_at?: string | null
          game_type: string
          id?: string
          result?: string | null
          room_id?: string | null
          round_number?: number | null
          started_at?: string | null
          status?: string | null
          stream_id: string
          total_bet_amount?: number | null
          total_bets?: number | null
          total_players?: number | null
          total_pool?: number | null
          winning_value?: string | null
        }
        Update: {
          betting_end_at?: string | null
          created_at?: string | null
          created_by?: string | null
          ended_at?: string | null
          game_end_at?: string | null
          game_id?: string | null
          game_start_at?: string | null
          game_type?: string
          id?: string
          result?: string | null
          room_id?: string | null
          round_number?: number | null
          started_at?: string | null
          status?: string | null
          stream_id?: string
          total_bet_amount?: number | null
          total_bets?: number | null
          total_players?: number | null
          total_pool?: number | null
          winning_value?: string | null
        }
        Relationships: []
      }
      live_moderation_settings: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      live_streams: {
        Row: {
          category_id: string | null
          created_at: string | null
          current_music_title: string | null
          current_music_url: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_active: boolean | null
          last_heartbeat: string | null
          live_password_hash: string | null
          live_privacy: string
          music_playing: boolean | null
          music_started_at: string | null
          room_id: string | null
          started_at: string | null
          status: string | null
          stream_type: string | null
          thumbnail_url: string | null
          title: string | null
          total_coins_earned: number | null
          total_gifts: number | null
          viewer_count: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          live_password_hash?: string | null
          live_privacy?: string
          music_playing?: boolean | null
          music_started_at?: string | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_type?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_coins_earned?: number | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          live_password_hash?: string | null
          live_privacy?: string
          music_playing?: boolean | null
          music_started_at?: string | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_type?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_coins_earned?: number | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_streams_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "live_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_streams_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      live_violations: {
        Row: {
          action_taken: string | null
          created_at: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string | null
          stream_id: string
          user_id: string
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          stream_id: string
          user_id: string
          violation_type: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string | null
          stream_id?: string
          user_id?: string
          violation_type?: string
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          created_at: string | null
          failure_reason: string | null
          id: string
          identifier: string
          ip_address: string | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          identifier: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string | null
          failure_reason?: string | null
          id?: string
          identifier?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
      }
      lucky_gift_config: {
        Row: {
          created_at: string | null
          diamond_reward: number
          display_order: number | null
          gift_id: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
          win_chance_percent: number
        }
        Insert: {
          created_at?: string | null
          diamond_reward?: number
          display_order?: number | null
          gift_id?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          win_chance_percent?: number
        }
        Update: {
          created_at?: string | null
          diamond_reward?: number
          display_order?: number | null
          gift_id?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
          win_chance_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "lucky_gift_config_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_gift_config_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      lucky_gift_results: {
        Row: {
          created_at: string | null
          diamonds_won: number | null
          gift_id: string | null
          id: string
          is_winner: boolean | null
          receiver_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          diamonds_won?: number | null
          gift_id?: string | null
          id?: string
          is_winner?: boolean | null
          receiver_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          diamonds_won?: number | null
          gift_id?: string | null
          id?: string
          is_winner?: boolean | null
          receiver_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lucky_gift_results_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lucky_gift_results_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          delivered_at: string | null
          encryption_version: number | null
          id: string
          is_ai_reply: boolean | null
          is_deleted: boolean | null
          is_encrypted: boolean | null
          is_read: boolean | null
          media_url: string | null
          message_type: string | null
          read_at: string | null
          reply_to_id: string | null
          sender_id: string
          status: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          encryption_version?: number | null
          id?: string
          is_ai_reply?: boolean | null
          is_deleted?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id: string
          status?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          encryption_version?: number | null
          id?: string
          is_ai_reply?: boolean | null
          is_deleted?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          read_at?: string | null
          reply_to_id?: string | null
          sender_id?: string
          status?: string | null
        }
        Relationships: []
      }
      movies: {
        Row: {
          created_at: string | null
          description: string | null
          duration: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          poster_url: string | null
          rating: number | null
          title: string
          video_url: string
          view_count: number | null
          year: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          poster_url?: string | null
          rating?: number | null
          title: string
          video_url: string
          view_count?: number | null
          year?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          poster_url?: string | null
          rating?: number | null
          title?: string
          video_url?: string
          view_count?: number | null
          year?: number | null
        }
        Relationships: []
      }
      music: {
        Row: {
          album: string | null
          artist: string | null
          audio_url: string
          cover_url: string | null
          created_at: string | null
          duration: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          title: string
        }
        Insert: {
          album?: string | null
          artist?: string | null
          audio_url: string
          cover_url?: string | null
          created_at?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          title: string
        }
        Update: {
          album?: string | null
          artist?: string | null
          audio_url?: string
          cover_url?: string | null
          created_at?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          title?: string
        }
        Relationships: []
      }
      new_host_live_bonus_progress: {
        Row: {
          actual_minutes: number | null
          bonus_amount: number
          bonus_claimed: boolean
          claimed_at: string | null
          claimed_beans: number | null
          completed_at: string | null
          created_at: string | null
          day_number: number
          host_id: string
          hour_number: number | null
          id: string
          is_completed: boolean | null
          minutes_accumulated: number
          program_day: number | null
          target_minutes: number
          task_date: string | null
        }
        Insert: {
          actual_minutes?: number | null
          bonus_amount: number
          bonus_claimed?: boolean
          claimed_at?: string | null
          claimed_beans?: number | null
          completed_at?: string | null
          created_at?: string | null
          day_number: number
          host_id: string
          hour_number?: number | null
          id?: string
          is_completed?: boolean | null
          minutes_accumulated?: number
          program_day?: number | null
          target_minutes: number
          task_date?: string | null
        }
        Update: {
          actual_minutes?: number | null
          bonus_amount?: number
          bonus_claimed?: boolean
          claimed_at?: string | null
          claimed_beans?: number | null
          completed_at?: string | null
          created_at?: string | null
          day_number?: number
          host_id?: string
          hour_number?: number | null
          id?: string
          is_completed?: boolean | null
          minutes_accumulated?: number
          program_day?: number | null
          target_minutes?: number
          task_date?: string | null
        }
        Relationships: []
      }
      new_host_live_bonus_settings: {
        Row: {
          beans_per_hour: number | null
          bonus_amount: number
          bonus_beans: number | null
          created_at: string | null
          daily_reset_offset_minutes: number
          day_number: number
          eligible_days: number | null
          eligible_program_days: number
          hour_number: number | null
          id: string
          is_active: boolean | null
          max_hours_per_day: number | null
          target_minutes: number
          updated_at: string | null
        }
        Insert: {
          beans_per_hour?: number | null
          bonus_amount: number
          bonus_beans?: number | null
          created_at?: string | null
          daily_reset_offset_minutes?: number
          day_number: number
          eligible_days?: number | null
          eligible_program_days?: number
          hour_number?: number | null
          id?: string
          is_active?: boolean | null
          max_hours_per_day?: number | null
          target_minutes: number
          updated_at?: string | null
        }
        Update: {
          beans_per_hour?: number | null
          bonus_amount?: number
          bonus_beans?: number | null
          created_at?: string | null
          daily_reset_offset_minutes?: number
          day_number?: number
          eligible_days?: number | null
          eligible_program_days?: number
          hour_number?: number | null
          id?: string
          is_active?: boolean | null
          max_hours_per_day?: number | null
          target_minutes?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      news: {
        Row: {
          category: string | null
          content: string | null
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          published_at: string | null
          source: string | null
          title: string
        }
        Insert: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          published_at?: string | null
          source?: string | null
          title: string
        }
        Update: {
          category?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          published_at?: string | null
          source?: string | null
          title?: string
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          category: string | null
          country: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          language: string | null
          name: string
          url: string
        }
        Insert: {
          category?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name: string
          url: string
        }
        Update: {
          category?: string | null
          country?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          name?: string
          url?: string
        }
        Relationships: []
      }
      noble_cards: {
        Row: {
          anti_kick_protection: boolean
          badge_color: string | null
          badge_url: string | null
          cashback_percent: number
          created_at: string
          crown_url: string | null
          custom_avatar_frame_url: string | null
          custom_chat_bubble_url: string | null
          daily_free_diamonds: number
          description: string | null
          display_order: number
          duration_days: number
          entrance_animation_url: string | null
          entry_effect_duration_seconds: number
          exclusive_emoji_pack: boolean
          forbidden_words_bypass: boolean
          free_name_changes_per_month: number
          hide_real_level: boolean
          id: string
          is_active: boolean
          monthly_diamond_cost: number
          monthly_free_diamonds: number
          priority_random_match: boolean
          profile_background_url: string | null
          rank_code: string
          rank_name: string
          rank_order: number
          recharge_bonus_percent: number
          stealth_mode: boolean
          top_position_in_lists: boolean
          updated_at: string
          username_color: string | null
          vip_only_lounge_access: boolean
        }
        Insert: {
          anti_kick_protection?: boolean
          badge_color?: string | null
          badge_url?: string | null
          cashback_percent?: number
          created_at?: string
          crown_url?: string | null
          custom_avatar_frame_url?: string | null
          custom_chat_bubble_url?: string | null
          daily_free_diamonds?: number
          description?: string | null
          display_order?: number
          duration_days?: number
          entrance_animation_url?: string | null
          entry_effect_duration_seconds?: number
          exclusive_emoji_pack?: boolean
          forbidden_words_bypass?: boolean
          free_name_changes_per_month?: number
          hide_real_level?: boolean
          id?: string
          is_active?: boolean
          monthly_diamond_cost: number
          monthly_free_diamonds?: number
          priority_random_match?: boolean
          profile_background_url?: string | null
          rank_code: string
          rank_name: string
          rank_order?: number
          recharge_bonus_percent?: number
          stealth_mode?: boolean
          top_position_in_lists?: boolean
          updated_at?: string
          username_color?: string | null
          vip_only_lounge_access?: boolean
        }
        Update: {
          anti_kick_protection?: boolean
          badge_color?: string | null
          badge_url?: string | null
          cashback_percent?: number
          created_at?: string
          crown_url?: string | null
          custom_avatar_frame_url?: string | null
          custom_chat_bubble_url?: string | null
          daily_free_diamonds?: number
          description?: string | null
          display_order?: number
          duration_days?: number
          entrance_animation_url?: string | null
          entry_effect_duration_seconds?: number
          exclusive_emoji_pack?: boolean
          forbidden_words_bypass?: boolean
          free_name_changes_per_month?: number
          hide_real_level?: boolean
          id?: string
          is_active?: boolean
          monthly_diamond_cost?: number
          monthly_free_diamonds?: number
          priority_random_match?: boolean
          profile_background_url?: string | null
          rank_code?: string
          rank_name?: string
          rank_order?: number
          recharge_bonus_percent?: number
          stealth_mode?: boolean
          top_position_in_lists?: boolean
          updated_at?: string
          username_color?: string | null
          vip_only_lounge_access?: boolean
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          category: string
          enabled: boolean
          id: string
          push_enabled: boolean
          sound_enabled: boolean
          updated_at: string | null
          user_id: string
        }
        Insert: {
          category: string
          enabled?: boolean
          id?: string
          push_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string | null
          user_id: string
        }
        Update: {
          category?: string
          enabled?: boolean
          id?: string
          push_enabled?: boolean
          sound_enabled?: boolean
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          action_data: Json | null
          action_type: string | null
          body: string
          category: string | null
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          message_template: string | null
          template_key: string
          title: string
          title_template: string | null
          updated_at: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type?: string | null
          body: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          message_template?: string | null
          template_key: string
          title: string
          title_template?: string | null
          updated_at?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string | null
          body?: string
          category?: string | null
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          message_template?: string | null
          template_key?: string
          title?: string
          title_template?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_slides: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          gradient: string | null
          id: string
          image_url: string
          is_active: boolean | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          gradient?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          gradient?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      parcel_claims: {
        Row: {
          claimed_at: string | null
          id: string
          parcel_id: string
          reward_amount: number
          reward_type: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          id?: string
          parcel_id: string
          reward_amount: number
          reward_type: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          id?: string
          parcel_id?: string
          reward_amount?: number
          reward_type?: string
          user_id?: string
        }
        Relationships: []
      }
      parcel_templates: {
        Row: {
          coin_cost: number | null
          created_at: string | null
          description: string | null
          display_order: number | null
          expiry_hours: number
          glow_color: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          max_level: number
          max_reward: number
          min_level: number
          min_reward: number
          name: string
          parcel_type: string
          reward_amount: number
          reward_label: string | null
          reward_type: string
          target_segment: string
          unlock_condition: string
          unlock_threshold: number
          unlock_wait_hours: number
        }
        Insert: {
          coin_cost?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expiry_hours?: number
          glow_color?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_level?: number
          max_reward: number
          min_level?: number
          min_reward: number
          name: string
          parcel_type?: string
          reward_amount?: number
          reward_label?: string | null
          reward_type: string
          target_segment?: string
          unlock_condition?: string
          unlock_threshold?: number
          unlock_wait_hours?: number
        }
        Update: {
          coin_cost?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expiry_hours?: number
          glow_color?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_level?: number
          max_reward?: number
          min_level?: number
          min_reward?: number
          name?: string
          parcel_type?: string
          reward_amount?: number
          reward_label?: string | null
          reward_type?: string
          target_segment?: string
          unlock_condition?: string
          unlock_threshold?: number
          unlock_wait_hours?: number
        }
        Relationships: []
      }
      party_room_backgrounds: {
        Row: {
          category: string | null
          created_at: string | null
          display_order: number | null
          gradient_css: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean | null
          min_level: number
          name: string
          price_coins: number | null
          price_diamonds: number | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          gradient_css?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          min_level?: number
          name: string
          price_coins?: number | null
          price_diamonds?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          gradient_css?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          min_level?: number
          name?: string
          price_coins?: number | null
          price_diamonds?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      party_room_banners: {
        Row: {
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      party_room_messages: {
        Row: {
          content: string
          created_at: string | null
          gift_data: Json | null
          id: string
          is_deleted: boolean | null
          message_type: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          gift_data?: Json | null
          id?: string
          is_deleted?: boolean | null
          message_type?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          gift_data?: Json | null
          id?: string
          is_deleted?: boolean | null
          message_type?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: []
      }
      party_room_participants: {
        Row: {
          id: string
          is_muted: boolean | null
          joined_at: string | null
          left_at: string | null
          role: string | null
          room_id: string
          seat_number: number | null
          user_id: string
        }
        Insert: {
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          room_id: string
          seat_number?: number | null
          user_id: string
        }
        Update: {
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          role?: string | null
          room_id?: string
          seat_number?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      party_rooms: {
        Row: {
          announcement: string | null
          background_url: string | null
          country_code: string | null
          created_at: string | null
          description: string | null
          ended_at: string | null
          entry_fee: number
          game_mode: string | null
          host_id: string
          id: string
          is_active: boolean | null
          is_locked: boolean | null
          max_participants: number | null
          min_level: number
          mood: string | null
          name: string
          password: string | null
          room_code: string | null
          room_type: string | null
          total_seats: number | null
          welcome_message: string | null
        }
        Insert: {
          announcement?: string | null
          background_url?: string | null
          country_code?: string | null
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          entry_fee?: number
          game_mode?: string | null
          host_id: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          max_participants?: number | null
          min_level?: number
          mood?: string | null
          name: string
          password?: string | null
          room_code?: string | null
          room_type?: string | null
          total_seats?: number | null
          welcome_message?: string | null
        }
        Update: {
          announcement?: string | null
          background_url?: string | null
          country_code?: string | null
          created_at?: string | null
          description?: string | null
          ended_at?: string | null
          entry_fee?: number
          game_mode?: string | null
          host_id?: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          max_participants?: number | null
          min_level?: number
          mood?: string | null
          name?: string
          password?: string | null
          room_code?: string | null
          room_type?: string | null
          total_seats?: number | null
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "party_rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_otps: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          api_key_ref: string | null
          config: Json | null
          country_codes: string[] | null
          created_at: string | null
          display_order: number | null
          gateway_type: string
          id: string
          is_active: boolean | null
          is_integrated: boolean | null
          logo_url: string | null
          name: string
          supported_currencies: string[] | null
          updated_at: string | null
        }
        Insert: {
          api_key_ref?: string | null
          config?: Json | null
          country_codes?: string[] | null
          created_at?: string | null
          display_order?: number | null
          gateway_type: string
          id?: string
          is_active?: boolean | null
          is_integrated?: boolean | null
          logo_url?: string | null
          name: string
          supported_currencies?: string[] | null
          updated_at?: string | null
        }
        Update: {
          api_key_ref?: string | null
          config?: Json | null
          country_codes?: string[] | null
          created_at?: string | null
          display_order?: number | null
          gateway_type?: string
          id?: string
          is_active?: boolean | null
          is_integrated?: boolean | null
          logo_url?: string | null
          name?: string
          supported_currencies?: string[] | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_info: Json | null
          country_codes: string[] | null
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          method_type: string
          name: string
          updated_at: string | null
        }
        Insert: {
          account_info?: Json | null
          country_codes?: string[] | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_type: string
          name: string
          updated_at?: string | null
        }
        Update: {
          account_info?: Json | null
          country_codes?: string[] | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          method_type?: string
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_reconciliation_log: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          discrepancy_amount: number | null
          external_reference: string | null
          gateway_id: string | null
          id: string
          notes: string | null
          reconciled_at: string | null
          status: string | null
          transaction_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          discrepancy_amount?: number | null
          external_reference?: string | null
          gateway_id?: string | null
          id?: string
          notes?: string | null
          reconciled_at?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          discrepancy_amount?: number | null
          external_reference?: string | null
          gateway_id?: string | null
          id?: string
          notes?: string | null
          reconciled_at?: string | null
          status?: string | null
          transaction_id?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          amount_usd: number | null
          created_at: string | null
          currency: string | null
          diamonds_amount: number | null
          external_transaction_id: string | null
          gateway_id: string | null
          gateway_response: Json | null
          id: string
          notes: string | null
          package_id: string | null
          payment_method: string | null
          status: string | null
          transaction_ref: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          amount_usd?: number | null
          created_at?: string | null
          currency?: string | null
          diamonds_amount?: number | null
          external_transaction_id?: string | null
          gateway_id?: string | null
          gateway_response?: Json | null
          id?: string
          notes?: string | null
          package_id?: string | null
          payment_method?: string | null
          status?: string | null
          transaction_ref?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          amount_usd?: number | null
          created_at?: string | null
          currency?: string | null
          diamonds_amount?: number | null
          external_transaction_id?: string | null
          gateway_id?: string | null
          gateway_response?: Json | null
          id?: string
          notes?: string | null
          package_id?: string | null
          payment_method?: string | null
          status?: string | null
          transaction_ref?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_requests: {
        Row: {
          beans_amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_details: Json | null
          payment_method: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          usd_amount: number
          user_id: string
        }
        Insert: {
          beans_amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_details?: Json | null
          payment_method: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          usd_amount: number
          user_id: string
        }
        Update: {
          beans_amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          usd_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      phone_otps: {
        Row: {
          created_at: string | null
          delivery_method: string | null
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
          phone_number: string
          purpose: string | null
        }
        Insert: {
          created_at?: string | null
          delivery_method?: string | null
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
          phone_number: string
          purpose?: string | null
        }
        Update: {
          created_at?: string | null
          delivery_method?: string | null
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
          phone_number?: string
          purpose?: string | null
        }
        Relationships: []
      }
      pk_battle_gifts: {
        Row: {
          battle_id: string
          coin_amount: number
          created_at: string | null
          gift_id: string
          id: string
          sender_id: string
          target_host_id: string
        }
        Insert: {
          battle_id: string
          coin_amount: number
          created_at?: string | null
          gift_id: string
          id?: string
          sender_id: string
          target_host_id: string
        }
        Update: {
          battle_id?: string
          coin_amount?: number
          created_at?: string | null
          gift_id?: string
          id?: string
          sender_id?: string
          target_host_id?: string
        }
        Relationships: []
      }
      pk_battles: {
        Row: {
          challenger_id: string | null
          challenger_score: number | null
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          host1_id: string
          host1_score: number | null
          host2_id: string
          host2_score: number | null
          id: string
          opponent_id: string | null
          opponent_score: number | null
          started_at: string | null
          status: string | null
          stream1_id: string | null
          stream2_id: string | null
          winner_id: string | null
        }
        Insert: {
          challenger_id?: string | null
          challenger_score?: number | null
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          host1_id: string
          host1_score?: number | null
          host2_id: string
          host2_score?: number | null
          id?: string
          opponent_id?: string | null
          opponent_score?: number | null
          started_at?: string | null
          status?: string | null
          stream1_id?: string | null
          stream2_id?: string | null
          winner_id?: string | null
        }
        Update: {
          challenger_id?: string | null
          challenger_score?: number | null
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          host1_id?: string
          host1_score?: number | null
          host2_id?: string
          host2_score?: number | null
          id?: string
          opponent_id?: string | null
          opponent_score?: number | null
          started_at?: string | null
          status?: string | null
          stream1_id?: string | null
          stream2_id?: string | null
          winner_id?: string | null
        }
        Relationships: []
      }
      pk_competition_rewards: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          is_active: boolean | null
          rank_from: number
          rank_to: number
          reward_badge: string | null
          reward_beans: number
          reward_coins: number
          reward_diamonds: number
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          rank_from?: number
          rank_to?: number
          reward_badge?: string | null
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          rank_from?: number
          rank_to?: number
          reward_badge?: string | null
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
        }
        Relationships: []
      }
      pk_competitions: {
        Row: {
          banner_image_url: string | null
          competition_type: string
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          id: string
          is_active: boolean | null
          max_participants: number | null
          start_date: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          banner_image_url?: string | null
          competition_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean | null
          max_participants?: number | null
          start_date: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          banner_image_url?: string | null
          competition_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean | null
          max_participants?: number | null
          start_date?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pk_participants: {
        Row: {
          competition_id: string
          id: string
          joined_at: string
          rank_position: number | null
          reward_distributed: boolean | null
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          competition_id: string
          id?: string
          joined_at?: string
          rank_position?: number | null
          reward_distributed?: boolean | null
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          competition_id?: string
          id?: string
          joined_at?: string
          rank_position?: number | null
          reward_distributed?: boolean | null
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pk_reward_banners: {
        Row: {
          banner_image_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
          end_date: string | null
          id: string
          is_active: boolean | null
          reward_details: Json | null
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          banner_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          reward_details?: Json | null
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          banner_image_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          is_active?: boolean | null
          reward_details?: Json | null
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pk_reward_history: {
        Row: {
          competition_id: string
          distributed_at: string
          id: string
          rank_position: number
          reward_beans: number | null
          reward_coins: number | null
          reward_diamonds: number | null
          user_id: string
        }
        Insert: {
          competition_id: string
          distributed_at?: string
          id?: string
          rank_position: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          user_id: string
        }
        Update: {
          competition_id?: string
          distributed_at?: string
          id?: string
          rank_position?: number
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          user_id?: string
        }
        Relationships: []
      }
      popup_event_banners: {
        Row: {
          auto_dismiss_seconds: number
          created_at: string
          description: string | null
          display_duration_seconds: number
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_type: string | null
          link_url: string | null
          skip_delay_seconds: number
          start_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          auto_dismiss_seconds?: number
          created_at?: string
          description?: string | null
          display_duration_seconds?: number
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          skip_delay_seconds?: number
          start_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          auto_dismiss_seconds?: number
          created_at?: string
          description?: string | null
          display_duration_seconds?: number
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          skip_delay_seconds?: number
          start_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      poster_images: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_primary: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_primary?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_primary?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      premium_animations_hidden: {
        Row: {
          animation_id: string
          hidden_at: string
          hidden_by: string | null
          reason: string | null
        }
        Insert: {
          animation_id: string
          hidden_at?: string
          hidden_by?: string | null
          reason?: string | null
        }
        Update: {
          animation_id?: string
          hidden_at?: string
          hidden_by?: string | null
          reason?: string | null
        }
        Relationships: []
      }
      private_call_security_logs: {
        Row: {
          action_taken: string | null
          call_id: string | null
          detected_at: string | null
          device_info: Json | null
          event_type: string
          id: string
          user_id: string | null
        }
        Insert: {
          action_taken?: string | null
          call_id?: string | null
          detected_at?: string | null
          device_info?: Json | null
          event_type: string
          id?: string
          user_id?: string | null
        }
        Update: {
          action_taken?: string | null
          call_id?: string | null
          detected_at?: string | null
          device_info?: Json | null
          event_type?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      private_calls: {
        Row: {
          admin_notes: string | null
          caller_id: string
          caller_rating: number | null
          coins_per_minute: number | null
          coins_spent: number | null
          connected_at: string | null
          created_at: string
          duration_seconds: number | null
          end_reason: string | null
          ended_at: string | null
          host_earned: number | null
          host_earnings_amount: number | null
          host_earnings_credited: boolean | null
          host_earnings_credited_at: string | null
          host_earnings_credited_by: string | null
          host_id: string
          host_rating: number | null
          id: string
          last_billing_at: string | null
          settled_at: string | null
          started_at: string | null
          status: string
          stream_id: string | null
          total_coins_deducted: number | null
          updated_at: string | null
        }
        Insert: {
          admin_notes?: string | null
          caller_id: string
          caller_rating?: number | null
          coins_per_minute?: number | null
          coins_spent?: number | null
          connected_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          host_earned?: number | null
          host_earnings_amount?: number | null
          host_earnings_credited?: boolean | null
          host_earnings_credited_at?: string | null
          host_earnings_credited_by?: string | null
          host_id: string
          host_rating?: number | null
          id?: string
          last_billing_at?: string | null
          settled_at?: string | null
          started_at?: string | null
          status?: string
          stream_id?: string | null
          total_coins_deducted?: number | null
          updated_at?: string | null
        }
        Update: {
          admin_notes?: string | null
          caller_id?: string
          caller_rating?: number | null
          coins_per_minute?: number | null
          coins_spent?: number | null
          connected_at?: string | null
          created_at?: string
          duration_seconds?: number | null
          end_reason?: string | null
          ended_at?: string | null
          host_earned?: number | null
          host_earnings_amount?: number | null
          host_earnings_credited?: boolean | null
          host_earnings_credited_at?: string | null
          host_earnings_credited_by?: string | null
          host_id?: string
          host_rating?: number | null
          id?: string
          last_billing_at?: string | null
          settled_at?: string | null
          started_at?: string | null
          status?: string
          stream_id?: string | null
          total_coins_deducted?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_device_id: string | null
          active_session_id: string | null
          age: number | null
          agency_id: string | null
          app_uid: string | null
          avatar_url: string | null
          beans: number | null
          beans_balance: number | null
          beauty_presets: Json | null
          bio: string | null
          birthday: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_rate_per_minute: number | null
          city: string | null
          coins: number | null
          country_code: string | null
          country_flag: string | null
          country_locked: boolean
          country_locked_at: string | null
          country_name: string | null
          cover_url: string | null
          created_at: string | null
          current_call_id: string | null
          current_vip_tier_id: string | null
          deletion_requested_at: string | null
          deletion_scheduled_at: string | null
          device_id: string | null
          diamonds: number | null
          display_name: string | null
          email: string | null
          email_notifications: boolean | null
          equipped_bubble_id: string | null
          equipped_entrance_id: string | null
          equipped_entry_banner_id: string | null
          equipped_entry_name_bar_id: string | null
          equipped_frame_id: string | null
          equipped_medal_id: string | null
          equipped_noble_card_id: string | null
          equipped_vehicle_id: string | null
          face_hash: string | null
          face_verification_image: string | null
          face_verification_status: string | null
          face_verified_at: string | null
          frame_id: string | null
          gender: string | null
          hide_location: boolean
          host_availability: string | null
          host_level: number | null
          host_photos: string[]
          host_status: string | null
          host_verified_at: string | null
          id: string
          incoming_call_sound: string | null
          is_agency_owner: boolean | null
          is_banned: boolean
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_face_verified: boolean | null
          is_host: boolean | null
          is_in_call: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          language: string | null
          last_active_at: string | null
          last_device_id: string | null
          last_login_at: string | null
          last_login_device: string | null
          last_login_device_info: Json | null
          last_login_ip: string | null
          last_seen: string
          last_seen_at: string | null
          max_user_level: number | null
          notification_vibrate: boolean | null
          pending_earnings: number | null
          phone_number: string | null
          phone_verified: boolean | null
          phone_violation_count: number | null
          previous_bubble_id: string | null
          previous_entrance_id: string | null
          previous_entry_banner_id: string | null
          previous_entry_name_bar_id: string | null
          previous_frame_id: string | null
          previous_host_level: number | null
          previous_medal_id: string | null
          previous_noble_card_id: string | null
          previous_vehicle_id: string | null
          profile_photo_url: string | null
          region: string | null
          registration_country_code: string | null
          registration_device_info: Json | null
          registration_ip: string | null
          registration_user_agent: string | null
          signup_country_code: string | null
          signup_country_flag: string | null
          signup_country_name: string | null
          signup_ip: string | null
          tags: string[] | null
          total_call_minutes: number | null
          total_calls_made: number | null
          total_calls_received: number | null
          total_consumption: number | null
          total_earnings: number | null
          total_recharged: number | null
          updated_at: string | null
          user_level: number | null
          username: string | null
          verification_type: string | null
          vip_expires_at: string | null
          vip_tier: number | null
          weekly_earnings: number | null
          weekly_reset_at: string | null
          who_can_call_me: string | null
          who_can_message_me: string | null
        }
        Insert: {
          active_device_id?: string | null
          active_session_id?: string | null
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          beans?: number | null
          beans_balance?: number | null
          beauty_presets?: Json | null
          bio?: string | null
          birthday?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          coins?: number | null
          country_code?: string | null
          country_flag?: string | null
          country_locked?: boolean
          country_locked_at?: string | null
          country_name?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_call_id?: string | null
          current_vip_tier_id?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_at?: string | null
          device_id?: string | null
          diamonds?: number | null
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          equipped_bubble_id?: string | null
          equipped_entrance_id?: string | null
          equipped_entry_banner_id?: string | null
          equipped_entry_name_bar_id?: string | null
          equipped_frame_id?: string | null
          equipped_medal_id?: string | null
          equipped_noble_card_id?: string | null
          equipped_vehicle_id?: string | null
          face_hash?: string | null
          face_verification_image?: string | null
          face_verification_status?: string | null
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean
          host_availability?: string | null
          host_level?: number | null
          host_photos?: string[]
          host_status?: string | null
          host_verified_at?: string | null
          id: string
          incoming_call_sound?: string | null
          is_agency_owner?: boolean | null
          is_banned?: boolean
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_active_at?: string | null
          last_device_id?: string | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_device_info?: Json | null
          last_login_ip?: string | null
          last_seen?: string
          last_seen_at?: string | null
          max_user_level?: number | null
          notification_vibrate?: boolean | null
          pending_earnings?: number | null
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_violation_count?: number | null
          previous_bubble_id?: string | null
          previous_entrance_id?: string | null
          previous_entry_banner_id?: string | null
          previous_entry_name_bar_id?: string | null
          previous_frame_id?: string | null
          previous_host_level?: number | null
          previous_medal_id?: string | null
          previous_noble_card_id?: string | null
          previous_vehicle_id?: string | null
          profile_photo_url?: string | null
          region?: string | null
          registration_country_code?: string | null
          registration_device_info?: Json | null
          registration_ip?: string | null
          registration_user_agent?: string | null
          signup_country_code?: string | null
          signup_country_flag?: string | null
          signup_country_name?: string | null
          signup_ip?: string | null
          tags?: string[] | null
          total_call_minutes?: number | null
          total_calls_made?: number | null
          total_calls_received?: number | null
          total_consumption?: number | null
          total_earnings?: number | null
          total_recharged?: number | null
          updated_at?: string | null
          user_level?: number | null
          username?: string | null
          verification_type?: string | null
          vip_expires_at?: string | null
          vip_tier?: number | null
          weekly_earnings?: number | null
          weekly_reset_at?: string | null
          who_can_call_me?: string | null
          who_can_message_me?: string | null
        }
        Update: {
          active_device_id?: string | null
          active_session_id?: string | null
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          beans?: number | null
          beans_balance?: number | null
          beauty_presets?: Json | null
          bio?: string | null
          birthday?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          coins?: number | null
          country_code?: string | null
          country_flag?: string | null
          country_locked?: boolean
          country_locked_at?: string | null
          country_name?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_call_id?: string | null
          current_vip_tier_id?: string | null
          deletion_requested_at?: string | null
          deletion_scheduled_at?: string | null
          device_id?: string | null
          diamonds?: number | null
          display_name?: string | null
          email?: string | null
          email_notifications?: boolean | null
          equipped_bubble_id?: string | null
          equipped_entrance_id?: string | null
          equipped_entry_banner_id?: string | null
          equipped_entry_name_bar_id?: string | null
          equipped_frame_id?: string | null
          equipped_medal_id?: string | null
          equipped_noble_card_id?: string | null
          equipped_vehicle_id?: string | null
          face_hash?: string | null
          face_verification_image?: string | null
          face_verification_status?: string | null
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean
          host_availability?: string | null
          host_level?: number | null
          host_photos?: string[]
          host_status?: string | null
          host_verified_at?: string | null
          id?: string
          incoming_call_sound?: string | null
          is_agency_owner?: boolean | null
          is_banned?: boolean
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          last_active_at?: string | null
          last_device_id?: string | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_device_info?: Json | null
          last_login_ip?: string | null
          last_seen?: string
          last_seen_at?: string | null
          max_user_level?: number | null
          notification_vibrate?: boolean | null
          pending_earnings?: number | null
          phone_number?: string | null
          phone_verified?: boolean | null
          phone_violation_count?: number | null
          previous_bubble_id?: string | null
          previous_entrance_id?: string | null
          previous_entry_banner_id?: string | null
          previous_entry_name_bar_id?: string | null
          previous_frame_id?: string | null
          previous_host_level?: number | null
          previous_medal_id?: string | null
          previous_noble_card_id?: string | null
          previous_vehicle_id?: string | null
          profile_photo_url?: string | null
          region?: string | null
          registration_country_code?: string | null
          registration_device_info?: Json | null
          registration_ip?: string | null
          registration_user_agent?: string | null
          signup_country_code?: string | null
          signup_country_flag?: string | null
          signup_country_name?: string | null
          signup_ip?: string | null
          tags?: string[] | null
          total_call_minutes?: number | null
          total_calls_made?: number | null
          total_calls_received?: number | null
          total_consumption?: number | null
          total_earnings?: number | null
          total_recharged?: number | null
          updated_at?: string | null
          user_level?: number | null
          username?: string | null
          verification_type?: string | null
          vip_expires_at?: string | null
          vip_tier?: number | null
          weekly_earnings?: number | null
          weekly_reset_at?: string | null
          who_can_call_me?: string | null
          who_can_message_me?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_games: {
        Row: {
          created_at: string | null
          display_order: number | null
          game_category: string | null
          game_code: string
          game_name: string
          house_edge: number | null
          id: string
          is_active: boolean | null
          max_bet: number | null
          min_bet: number | null
          provider_id: string
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          game_category?: string | null
          game_code: string
          game_name: string
          house_edge?: number | null
          id?: string
          is_active?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          provider_id: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          game_category?: string | null
          game_code?: string
          game_name?: string
          house_edge?: number | null
          id?: string
          is_active?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          provider_id?: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ranking_rewards: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          period_type: string | null
          rank_position: number
          ranking_type: string
          reward_badge_url: string | null
          reward_beans: number | null
          reward_coins: number | null
          reward_diamonds: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          period_type?: string | null
          rank_position: number
          ranking_type: string
          reward_badge_url?: string | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          period_type?: string | null
          rank_position?: number
          ranking_type?: string
          reward_badge_url?: string | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
        }
        Relationships: []
      }
      rate_limit_attempts: {
        Row: {
          action_type: string
          attempted_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action_type: string
          attempted_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action_type?: string
          attempted_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          lockout_duration_seconds: number | null
          max_attempts: number
          window_seconds: number
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          lockout_duration_seconds?: number | null
          max_attempts?: number
          window_seconds?: number
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          lockout_duration_seconds?: number | null
          max_attempts?: number
          window_seconds?: number
        }
        Relationships: []
      }
      rating_banners: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      rating_reward_claims: {
        Row: {
          claimed_at: string
          created_at: string
          id: string
          platform: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_amount: number
          reward_coins: number
          reward_type: string
          screenshot_url: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          claimed_at?: string
          created_at?: string
          id?: string
          platform: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount?: number
          reward_coins?: number
          reward_type?: string
          screenshot_url?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          claimed_at?: string
          created_at?: string
          id?: string
          platform?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount?: number
          reward_coins?: number
          reward_type?: string
          screenshot_url?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      recharge_campaigns: {
        Row: {
          badge_text: string | null
          banner_image_url: string | null
          bonus_diamonds: number
          bonus_percentage: number | null
          campaign_name: string
          campaign_type: string
          created_at: string
          diamonds_amount: number
          display_locations: string[] | null
          duration_minutes: number
          id: string
          is_active: boolean
          is_first_recharge_only: boolean
          milestone_amount: number | null
          offer_price_usd: number | null
          original_price_usd: number
          priority: number
          schedule_end: string | null
          schedule_start: string | null
          target_audience: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          badge_text?: string | null
          banner_image_url?: string | null
          bonus_diamonds?: number
          bonus_percentage?: number | null
          campaign_name: string
          campaign_type?: string
          created_at?: string
          diamonds_amount?: number
          display_locations?: string[] | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_first_recharge_only?: boolean
          milestone_amount?: number | null
          offer_price_usd?: number | null
          original_price_usd?: number
          priority?: number
          schedule_end?: string | null
          schedule_start?: string | null
          target_audience?: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          badge_text?: string | null
          banner_image_url?: string | null
          bonus_diamonds?: number
          bonus_percentage?: number | null
          campaign_name?: string
          campaign_type?: string
          created_at?: string
          diamonds_amount?: number
          display_locations?: string[] | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          is_first_recharge_only?: boolean
          milestone_amount?: number | null
          offer_price_usd?: number | null
          original_price_usd?: number
          priority?: number
          schedule_end?: string | null
          schedule_start?: string | null
          target_audience?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recharge_transactions: {
        Row: {
          admin_notes: string | null
          agency_id: string | null
          agency_name: string | null
          agent_id: string | null
          agent_name: string | null
          amount: number
          bonus_coins: number | null
          coins_amount: number
          coins_received: number | null
          completed_at: string | null
          created_at: string
          currency: string | null
          currency_code: string | null
          device_info: Json | null
          exchange_rate: number | null
          google_order_id: string | null
          google_product_id: string | null
          helper_id: string | null
          id: string
          ip_address: string | null
          local_currency_amount: number | null
          local_payment_number: string | null
          local_payment_provider: string | null
          notes: string | null
          order_id: string | null
          payment_method: string | null
          payment_method_id: string | null
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          purchase_source: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          usd_amount: number | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          agency_id?: string | null
          agency_name?: string | null
          agent_id?: string | null
          agent_name?: string | null
          amount: number
          bonus_coins?: number | null
          coins_amount: number
          coins_received?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          currency_code?: string | null
          device_info?: Json | null
          exchange_rate?: number | null
          google_order_id?: string | null
          google_product_id?: string | null
          helper_id?: string | null
          id?: string
          ip_address?: string | null
          local_currency_amount?: number | null
          local_payment_number?: string | null
          local_payment_provider?: string | null
          notes?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          purchase_source?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          usd_amount?: number | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          agency_id?: string | null
          agency_name?: string | null
          agent_id?: string | null
          agent_name?: string | null
          amount?: number
          bonus_coins?: number | null
          coins_amount?: number
          coins_received?: number | null
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          currency_code?: string | null
          device_info?: Json | null
          exchange_rate?: number | null
          google_order_id?: string | null
          google_product_id?: string | null
          helper_id?: string | null
          id?: string
          ip_address?: string | null
          local_currency_amount?: number | null
          local_payment_number?: string | null
          local_payment_provider?: string | null
          notes?: string | null
          order_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          purchase_source?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          usd_amount?: number | null
          user_id?: string
        }
        Relationships: []
      }
      recovery_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          token_type: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          token_type?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          token_type?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      reel_categories: {
        Row: {
          created_at: string
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
        }
        Relationships: []
      }
      reel_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number | null
          parent_id: string | null
          reel_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          reel_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number | null
          parent_id?: string | null
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_likes: {
        Row: {
          created_at: string
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_moderation_log: {
        Row: {
          created_at: string
          details: Json | null
          id: string
          is_safe: boolean
          provider: string | null
          reason: string | null
          reel_id: string | null
          score: number | null
          user_id: string | null
          video_url: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          id?: string
          is_safe: boolean
          provider?: string | null
          reason?: string | null
          reel_id?: string | null
          score?: number | null
          user_id?: string | null
          video_url: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          id?: string
          is_safe?: boolean
          provider?: string | null
          reason?: string | null
          reel_id?: string | null
          score?: number | null
          user_id?: string | null
          video_url?: string
        }
        Relationships: []
      }
      reel_reports: {
        Row: {
          created_at: string
          id: string
          reason: string
          reel_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          reel_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          reel_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_reports_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_shares: {
        Row: {
          created_at: string
          id: string
          platform: string | null
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          platform?: string | null
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          platform?: string | null
          reel_id?: string
          user_id?: string
        }
        Relationships: []
      }
      reels: {
        Row: {
          beans_earned: number | null
          caption: string | null
          category_id: string | null
          comment_count: number
          comments_count: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          is_original_sound: boolean | null
          is_public: boolean | null
          like_count: number | null
          likes_count: number | null
          music_artist: string | null
          music_id: string | null
          music_title: string | null
          share_count: number
          shares_count: number | null
          sound_artist: string | null
          sound_audio_url: string | null
          sound_id: string | null
          sound_title: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_url: string
          view_count: number | null
          views_count: number | null
        }
        Insert: {
          beans_earned?: number | null
          caption?: string | null
          category_id?: string | null
          comment_count?: number
          comments_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_original_sound?: boolean | null
          is_public?: boolean | null
          like_count?: number | null
          likes_count?: number | null
          music_artist?: string | null
          music_id?: string | null
          music_title?: string | null
          share_count?: number
          shares_count?: number | null
          sound_artist?: string | null
          sound_audio_url?: string | null
          sound_id?: string | null
          sound_title?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_url: string
          view_count?: number | null
          views_count?: number | null
        }
        Update: {
          beans_earned?: number | null
          caption?: string | null
          category_id?: string | null
          comment_count?: number
          comments_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_original_sound?: boolean | null
          is_public?: boolean | null
          like_count?: number | null
          likes_count?: number | null
          music_artist?: string | null
          music_id?: string | null
          music_title?: string | null
          share_count?: number
          shares_count?: number | null
          sound_artist?: string | null
          sound_audio_url?: string | null
          sound_id?: string | null
          sound_title?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string
          view_count?: number | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reels_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_bonus_claims: {
        Row: {
          bonus_coins: number | null
          granted_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          bonus_coins?: number | null
          granted_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          bonus_coins?: number | null
          granted_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      rekognition_shards: {
        Row: {
          capacity: number
          created_at: string
          face_count: number
          is_active: boolean
          shard_id: string
          shard_index: number
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          face_count?: number
          is_active?: boolean
          shard_id: string
          shard_index: number
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          face_count?: number
          is_active?: boolean
          shard_id?: string
          shard_index?: number
          updated_at?: string
        }
        Relationships: []
      }
      role_frames: {
        Row: {
          animation_type: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          frame_url: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          role_type: string
          svga_url: string | null
        }
        Insert: {
          animation_type?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          frame_url: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number | null
          role_type: string
          svga_url?: string | null
        }
        Update: {
          animation_type?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          frame_url?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number | null
          role_type?: string
          svga_url?: string | null
        }
        Relationships: []
      }
      room_welcome_messages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          message_text: string
          room_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          message_text: string
          room_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          message_text?: string
          room_id?: string | null
        }
        Relationships: []
      }
      roulette_bets: {
        Row: {
          bet_amount: number
          bet_type: string
          bet_value: string
          created_at: string
          id: string
          is_winner: boolean | null
          session_id: string
          user_id: string
          win_amount: number | null
        }
        Insert: {
          bet_amount: number
          bet_type: string
          bet_value: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          session_id: string
          user_id: string
          win_amount?: number | null
        }
        Update: {
          bet_amount?: number
          bet_type?: string
          bet_value?: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          session_id?: string
          user_id?: string
          win_amount?: number | null
        }
        Relationships: []
      }
      roulette_sessions: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          room_id: string | null
          started_at: string
          status: string
          total_bets: number | null
          total_pool: number | null
          winning_color: string | null
          winning_number: number | null
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          room_id?: string | null
          started_at?: string
          status?: string
          total_bets?: number | null
          total_pool?: number | null
          winning_color?: string | null
          winning_number?: number | null
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          room_id?: string | null
          started_at?: string
          status?: string
          total_bets?: number | null
          total_pool?: number | null
          winning_color?: string | null
          winning_number?: number | null
        }
        Relationships: []
      }
      seat_invitations: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          invitee_id: string
          inviter_id: string
          room_id: string
          seat_number: number
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          invitee_id: string
          inviter_id: string
          room_id: string
          seat_number: number
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          invitee_id?: string
          inviter_id?: string
          room_id?: string
          seat_number?: number
          status?: string
        }
        Relationships: []
      }
      seat_requests: {
        Row: {
          created_at: string
          id: string
          responded_at: string | null
          room_id: string
          seat_number: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          responded_at?: string | null
          room_id: string
          seat_number: number
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          responded_at?: string | null
          room_id?: string
          seat_number?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_requests_requester_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_requester_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          is_resolved: boolean | null
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          created_at: string
          details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      session_security_logs: {
        Row: {
          created_at: string
          details: Json | null
          device_fingerprint: string | null
          event_type: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          device_fingerprint?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          device_fingerprint?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      shop_items: {
        Row: {
          animation_file_url: string | null
          animation_type: string | null
          animation_url: string | null
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_days: number | null
          file_type: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          is_permanent: boolean | null
          is_premium: boolean | null
          is_vip_exclusive: boolean | null
          item_type: string
          level_required: number | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          rarity: string | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          tag: string | null
          total_sold: number | null
          updated_at: string
          vip_discount_percent: number | null
        }
        Insert: {
          animation_file_url?: string | null
          animation_type?: string | null
          animation_url?: string | null
          category: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          file_type?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_permanent?: boolean | null
          is_premium?: boolean | null
          is_vip_exclusive?: boolean | null
          item_type: string
          level_required?: number | null
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          rarity?: string | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tag?: string | null
          total_sold?: number | null
          updated_at?: string
          vip_discount_percent?: number | null
        }
        Update: {
          animation_file_url?: string | null
          animation_type?: string | null
          animation_url?: string | null
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          file_type?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_permanent?: boolean | null
          is_premium?: boolean | null
          is_vip_exclusive?: boolean | null
          item_type?: string
          level_required?: number | null
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          rarity?: string | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tag?: string | null
          total_sold?: number | null
          updated_at?: string
          vip_discount_percent?: number | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: string
          created_at: string
          id: string
          is_published: boolean | null
          language: string | null
          page_key: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          language?: string | null
          page_key: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean | null
          language?: string | null
          page_key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sports: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          source: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          source?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          source?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      stream_chat: {
        Row: {
          created_at: string
          id: string
          is_deleted: boolean | null
          is_pinned: boolean | null
          message: string
          message_type: string | null
          stream_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          message: string
          message_type?: string | null
          stream_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_deleted?: boolean | null
          is_pinned?: boolean | null
          message?: string
          message_type?: string | null
          stream_id?: string
          user_id?: string
        }
        Relationships: []
      }
      stream_recordings: {
        Row: {
          channel_name: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          expires_at: string | null
          file_size_bytes: number | null
          host_id: string | null
          host_name: string | null
          host_uid: string | null
          id: string
          metadata: Json | null
          recording_sid: string | null
          recording_url: string | null
          resource_id: string | null
          started_at: string | null
          status: string | null
          stream_id: string | null
          thumbnail_url: string | null
          total_coins: number | null
          total_gifts: number | null
          total_viewers: number | null
          updated_at: string | null
        }
        Insert: {
          channel_name?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          host_id?: string | null
          host_name?: string | null
          host_uid?: string | null
          id?: string
          metadata?: Json | null
          recording_sid?: string | null
          recording_url?: string | null
          resource_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_id?: string | null
          thumbnail_url?: string | null
          total_coins?: number | null
          total_gifts?: number | null
          total_viewers?: number | null
          updated_at?: string | null
        }
        Update: {
          channel_name?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          host_id?: string | null
          host_name?: string | null
          host_uid?: string | null
          id?: string
          metadata?: Json | null
          recording_sid?: string | null
          recording_url?: string | null
          resource_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_id?: string | null
          thumbnail_url?: string | null
          total_coins?: number | null
          total_gifts?: number | null
          total_viewers?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stream_recordings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_recordings_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_viewers: {
        Row: {
          id: string
          is_active: boolean | null
          joined_at: string | null
          left_at: string | null
          stream_id: string
          viewer_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          stream_id: string
          viewer_id: string
        }
        Update: {
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          left_at?: string | null
          stream_id?: string
          viewer_id?: string
        }
        Relationships: []
      }
      sub_agent_commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string | null
          gift_transaction_id: string | null
          host_id: string
          id: string
          source_type: string
          sub_agent_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string | null
          gift_transaction_id?: string | null
          host_id: string
          id?: string
          source_type?: string
          sub_agent_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          gift_transaction_id?: string | null
          host_id?: string
          id?: string
          source_type?: string
          sub_agent_id?: string
        }
        Relationships: []
      }
      sub_agent_referrals: {
        Row: {
          commission_earned: number | null
          created_at: string | null
          id: string
          referred_at: string | null
          referred_host_id: string
          status: string | null
          sub_agent_id: string
        }
        Insert: {
          commission_earned?: number | null
          created_at?: string | null
          id?: string
          referred_at?: string | null
          referred_host_id: string
          status?: string | null
          sub_agent_id: string
        }
        Update: {
          commission_earned?: number | null
          created_at?: string | null
          id?: string
          referred_at?: string | null
          referred_host_id?: string
          status?: string | null
          sub_agent_id?: string
        }
        Relationships: []
      }
      sub_agents: {
        Row: {
          agency_id: string
          commission_rate: number | null
          created_at: string | null
          id: string
          joined_at: string | null
          referral_code: string
          referrer_id: string | null
          status: string | null
          total_earnings: number | null
          total_referrals: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          agency_id: string
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          joined_at?: string | null
          referral_code: string
          referrer_id?: string | null
          status?: string | null
          total_earnings?: number | null
          total_referrals?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          joined_at?: string | null
          referral_code?: string
          referrer_id?: string | null
          status?: string | null
          total_earnings?: number | null
          total_referrals?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscription_orders: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          currency: string | null
          customer_country: string
          customer_email: string
          customer_name: string
          customer_phone: string | null
          id: string
          order_number: string
          payment_method_id: string | null
          payment_method_name: string | null
          payment_proof_url: string | null
          plan_id: string | null
          plan_name: string
          processed_at: string | null
          processed_by: string | null
          status: string | null
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string
          currency?: string | null
          customer_country: string
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          id?: string
          order_number: string
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          plan_name: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          currency?: string | null
          customer_country?: string
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          id?: string
          order_number?: string
          payment_method_id?: string | null
          payment_method_name?: string | null
          payment_proof_url?: string | null
          plan_id?: string | null
          plan_name?: string
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string
          currency: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          name: string
          price: number
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name: string
          price: number
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string
          price?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          attachment_type: string | null
          attachment_url: string | null
          content: string
          created_at: string
          id: string
          is_read: boolean
          original_language: string | null
          sender_id: string | null
          sender_type: string
          support_admin_name: string | null
          ticket_id: string
          translated_content: string | null
          voice_transcript: string | null
        }
        Insert: {
          attachment_type?: string | null
          attachment_url?: string | null
          content: string
          created_at?: string
          id?: string
          is_read?: boolean
          original_language?: string | null
          sender_id?: string | null
          sender_type?: string
          support_admin_name?: string | null
          ticket_id: string
          translated_content?: string | null
          voice_transcript?: string | null
        }
        Update: {
          attachment_type?: string | null
          attachment_url?: string | null
          content?: string
          created_at?: string
          id?: string
          is_read?: boolean
          original_language?: string | null
          sender_id?: string | null
          sender_type?: string
          support_admin_name?: string | null
          ticket_id?: string
          translated_content?: string | null
          voice_transcript?: string | null
        }
        Relationships: []
      }
      support_reports: {
        Row: {
          created_at: string
          id: string
          message_content: string
          message_id: string | null
          owner_notes: string | null
          reason: string
          reported_by_admin_id: string | null
          reported_by_admin_name: string | null
          reviewed_at: string | null
          reviewed_by_owner_id: string | null
          status: string
          ticket_id: string | null
          ticket_subject: string | null
          user_app_uid: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_content?: string
          message_id?: string | null
          owner_notes?: string | null
          reason: string
          reported_by_admin_id?: string | null
          reported_by_admin_name?: string | null
          reviewed_at?: string | null
          reviewed_by_owner_id?: string | null
          status?: string
          ticket_id?: string | null
          ticket_subject?: string | null
          user_app_uid?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_content?: string
          message_id?: string | null
          owner_notes?: string | null
          reason?: string
          reported_by_admin_id?: string | null
          reported_by_admin_name?: string | null
          reviewed_at?: string | null
          reviewed_by_owner_id?: string | null
          status?: string
          ticket_id?: string | null
          ticket_subject?: string | null
          user_app_uid?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_reports_reported_by_admin_id_fkey"
            columns: ["reported_by_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_reports_reviewed_by_owner_id_fkey"
            columns: ["reviewed_by_owner_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          closed_at: string | null
          created_at: string
          id: string
          priority: string
          resolved_at: string | null
          sender_sector: string | null
          status: string
          subject: string
          ticket_number: string
          updated_at: string
          user_email: string | null
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          sender_sector?: string | null
          status?: string
          subject: string
          ticket_number?: string
          updated_at?: string
          user_email?: string | null
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          sender_sector?: string | null
          status?: string
          subject?: string
          ticket_number?: string
          updated_at?: string
          user_email?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_error_logs: {
        Row: {
          browser_info: Json | null
          component_name: string | null
          created_at: string
          error_message: string
          error_stack: string | null
          error_type: string
          id: string
          is_resolved: boolean | null
          page_path: string | null
          page_url: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser_info?: Json | null
          component_name?: string | null
          created_at?: string
          error_message: string
          error_stack?: string | null
          error_type?: string
          id?: string
          is_resolved?: boolean | null
          page_path?: string | null
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser_info?: Json | null
          component_name?: string | null
          created_at?: string
          error_message?: string
          error_stack?: string | null
          error_type?: string
          id?: string
          is_resolved?: boolean | null
          page_path?: string | null
          page_url?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      topup_helper_levels: {
        Row: {
          badge_color: string | null
          commission_rate: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          level_name: string
          level_number: number
          max_withdrawal_amount: number | null
          min_withdrawal_amount: number | null
          upgrade_cost_usd: number | null
        }
        Insert: {
          badge_color?: string | null
          commission_rate?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_name: string
          level_number: number
          max_withdrawal_amount?: number | null
          min_withdrawal_amount?: number | null
          upgrade_cost_usd?: number | null
        }
        Update: {
          badge_color?: string | null
          commission_rate?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          level_name?: string
          level_number?: number
          max_withdrawal_amount?: number | null
          min_withdrawal_amount?: number | null
          upgrade_cost_usd?: number | null
        }
        Relationships: []
      }
      topup_helpers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_receive_orders: boolean | null
          buy_rate: number | null
          commission_rate: number | null
          contact_info: Json | null
          country_code: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          order_notification_email: string | null
          order_notification_phone: string | null
          payment_credentials: Json | null
          payroll_applied_at: string | null
          payroll_approved_at: string | null
          payroll_approved_by: string | null
          payroll_enabled: boolean | null
          payroll_status: string | null
          sell_rate: number | null
          supported_countries: string[] | null
          total_bought: number | null
          total_earnings: number | null
          total_level_upgrade_cost: number | null
          total_sold: number | null
          trader_level: number | null
          updated_at: string | null
          user_id: string
          wallet_balance: number | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_receive_orders?: boolean | null
          buy_rate?: number | null
          commission_rate?: number | null
          contact_info?: Json | null
          country_code?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          order_notification_email?: string | null
          order_notification_phone?: string | null
          payment_credentials?: Json | null
          payroll_applied_at?: string | null
          payroll_approved_at?: string | null
          payroll_approved_by?: string | null
          payroll_enabled?: boolean | null
          payroll_status?: string | null
          sell_rate?: number | null
          supported_countries?: string[] | null
          total_bought?: number | null
          total_earnings?: number | null
          total_level_upgrade_cost?: number | null
          total_sold?: number | null
          trader_level?: number | null
          updated_at?: string | null
          user_id: string
          wallet_balance?: number | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_receive_orders?: boolean | null
          buy_rate?: number | null
          commission_rate?: number | null
          contact_info?: Json | null
          country_code?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          order_notification_email?: string | null
          order_notification_phone?: string | null
          payment_credentials?: Json | null
          payroll_applied_at?: string | null
          payroll_approved_at?: string | null
          payroll_approved_by?: string | null
          payroll_enabled?: boolean | null
          payroll_status?: string | null
          sell_rate?: number | null
          supported_countries?: string[] | null
          total_bought?: number | null
          total_earnings?: number | null
          total_level_upgrade_cost?: number | null
          total_sold?: number | null
          trader_level?: number | null
          updated_at?: string | null
          user_id?: string
          wallet_balance?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      topup_payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          additional_info: Json | null
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          method_type: string
          name: string
          payment_instructions: string | null
          payment_number: string | null
          updated_at: string | null
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: Json | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          method_type: string
          name: string
          payment_instructions?: string | null
          payment_number?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: Json | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          method_type?: string
          name?: string
          payment_instructions?: string | null
          payment_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      trader_level_purchases: {
        Row: {
          admin_notes: string | null
          approved_at: string | null
          approved_by: string | null
          cost_usd: number
          created_at: string | null
          from_level: number
          id: string
          payment_method: string | null
          payment_proof: string | null
          status: string | null
          to_level: number
          trader_id: string
        }
        Insert: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cost_usd: number
          created_at?: string | null
          from_level: number
          id?: string
          payment_method?: string | null
          payment_proof?: string | null
          status?: string | null
          to_level: number
          trader_id: string
        }
        Update: {
          admin_notes?: string | null
          approved_at?: string | null
          approved_by?: string | null
          cost_usd?: number
          created_at?: string | null
          from_level?: number
          id?: string
          payment_method?: string | null
          payment_proof?: string | null
          status?: string | null
          to_level?: number
          trader_id?: string
        }
        Relationships: []
      }
      trader_level_tiers: {
        Row: {
          badge_color: string | null
          benefits: Json | null
          commission_rate: number | null
          created_at: string | null
          id: string
          is_active: boolean | null
          level_name: string
          level_number: number
          max_withdrawal_amount: number | null
          min_withdrawal_amount: number | null
          updated_at: string | null
          upgrade_cost_usd: number
        }
        Insert: {
          badge_color?: string | null
          benefits?: Json | null
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name: string
          level_number: number
          max_withdrawal_amount?: number | null
          min_withdrawal_amount?: number | null
          updated_at?: string | null
          upgrade_cost_usd?: number
        }
        Update: {
          badge_color?: string | null
          benefits?: Json | null
          commission_rate?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name?: string
          level_number?: number
          max_withdrawal_amount?: number | null
          min_withdrawal_amount?: number | null
          updated_at?: string | null
          upgrade_cost_usd?: number
        }
        Relationships: []
      }
      user_beans_exchange_history: {
        Row: {
          beans_amount: number
          created_at: string
          destination_type: string | null
          diamonds_received: number
          exchange_rate: number
          id: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          beans_amount: number
          created_at?: string
          destination_type?: string | null
          diamonds_received: number
          exchange_rate: number
          id?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          beans_amount?: number
          created_at?: string
          destination_type?: string | null
          diamonds_received?: number
          exchange_rate?: number
          id?: string
          tier_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_beans_exchange_tiers: {
        Row: {
          bonus_percent: number | null
          created_at: string
          display_order: number | null
          exchange_rate: number
          id: string
          is_active: boolean | null
          max_beans: number | null
          min_beans: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          bonus_percent?: number | null
          created_at?: string
          display_order?: number | null
          exchange_rate: number
          id?: string
          is_active?: boolean | null
          max_beans?: number | null
          min_beans: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          bonus_percent?: number | null
          created_at?: string
          display_order?: number | null
          exchange_rate?: number
          id?: string
          is_active?: boolean | null
          max_beans?: number | null
          min_beans?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      user_campaign_views: {
        Row: {
          campaign_id: string
          created_at: string
          first_seen_at: string
          id: string
          is_redeemed: boolean
          redeemed_at: string | null
          timer_started_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_redeemed?: boolean
          redeemed_at?: string | null
          timer_started_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          first_seen_at?: string
          id?: string
          is_redeemed?: boolean
          redeemed_at?: string | null
          timer_started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_campaign_views_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "recharge_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_chat_bubbles: {
        Row: {
          bubble_id: string
          expires_at: string | null
          id: string
          is_equipped: boolean
          purchased_at: string
          user_id: string
        }
        Insert: {
          bubble_id: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          purchased_at?: string
          user_id: string
        }
        Update: {
          bubble_id?: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_chat_bubbles_bubble_id_fkey"
            columns: ["bubble_id"]
            isOneToOne: false
            referencedRelation: "chat_bubbles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_chat_bubbles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_chat_bubbles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contact_violations: {
        Row: {
          coins_deducted: number
          created_at: string
          detected_content: string | null
          detected_pattern: string | null
          id: string
          is_auto_detected: boolean
          source_id: string | null
          source_type: string | null
          user_id: string
          violation_number: number
          violation_type: string
        }
        Insert: {
          coins_deducted?: number
          created_at?: string
          detected_content?: string | null
          detected_pattern?: string | null
          id?: string
          is_auto_detected?: boolean
          source_id?: string | null
          source_type?: string | null
          user_id: string
          violation_number: number
          violation_type?: string
        }
        Update: {
          coins_deducted?: number
          created_at?: string
          detected_content?: string | null
          detected_pattern?: string | null
          id?: string
          is_auto_detected?: boolean
          source_id?: string | null
          source_type?: string | null
          user_id?: string
          violation_number?: number
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_contact_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_contact_violations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entry_banners: {
        Row: {
          entry_banner_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          entry_banner_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          entry_banner_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_entry_effects: {
        Row: {
          effect_id: string
          expires_at: string | null
          id: string
          is_equipped: boolean
          purchased_at: string
          user_id: string
        }
        Insert: {
          effect_id: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          purchased_at?: string
          user_id: string
        }
        Update: {
          effect_id?: string
          expires_at?: string | null
          id?: string
          is_equipped?: boolean
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entry_effects_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "entry_effects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entry_effects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entry_effects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_gift_shop_entitlements: {
        Row: {
          expires_at: string | null
          gift_id: string
          id: string
          purchased_at: string
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          gift_id: string
          id?: string
          purchased_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string | null
          gift_id?: string
          id?: string
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_gift_shop_entitlements_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gift_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gift_shop_entitlements_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gift_shop_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_gift_shop_entitlements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          invitation_code: string
          invitee_id: string | null
          inviter_id: string
          reward_claimed: boolean | null
          status: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          invitation_code: string
          invitee_id?: string | null
          inviter_id: string
          reward_claimed?: boolean | null
          status?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          invitation_code?: string
          invitee_id?: string | null
          inviter_id?: string
          reward_claimed?: boolean | null
          status?: string | null
        }
        Relationships: []
      }
      user_level_thresholds: {
        Row: {
          badge_color: string | null
          badge_url: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          level: number
          min_consumption: number
          privileges: Json | null
        }
        Insert: {
          badge_color?: string | null
          badge_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          min_consumption: number
          privileges?: Json | null
        }
        Update: {
          badge_color?: string | null
          badge_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          min_consumption?: number
          privileges?: Json | null
        }
        Relationships: []
      }
      user_level_tiers: {
        Row: {
          animation_url: string | null
          badge_color: string | null
          badge_url: string | null
          bg_gradient: string | null
          created_at: string | null
          display_order: number | null
          frame_url: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level_color: string | null
          level_icon: string | null
          level_name: string
          level_number: number
          max_consumption: number | null
          min_consumption: number
          min_earning_amount: number | null
          min_topup_amount: number | null
          privileges: Json | null
          tier_type: string | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          bg_gradient?: string | null
          created_at?: string | null
          display_order?: number | null
          frame_url?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level_color?: string | null
          level_icon?: string | null
          level_name: string
          level_number: number
          max_consumption?: number | null
          min_consumption?: number
          min_earning_amount?: number | null
          min_topup_amount?: number | null
          privileges?: Json | null
          tier_type?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          bg_gradient?: string | null
          created_at?: string | null
          display_order?: number | null
          frame_url?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level_color?: string | null
          level_icon?: string | null
          level_name?: string
          level_number?: number
          max_consumption?: number | null
          min_consumption?: number
          min_earning_amount?: number | null
          min_topup_amount?: number | null
          privileges?: Json | null
          tier_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_levels: {
        Row: {
          badge_url: string | null
          created_at: string | null
          description: string | null
          diamonds_required: number | null
          id: string
          is_active: boolean | null
          level_name: string
          level_number: number
          updated_at: string | null
        }
        Insert: {
          badge_url?: string | null
          created_at?: string | null
          description?: string | null
          diamonds_required?: number | null
          id?: string
          is_active?: boolean | null
          level_name: string
          level_number: number
          updated_at?: string | null
        }
        Update: {
          badge_url?: string | null
          created_at?: string | null
          description?: string | null
          diamonds_required?: number | null
          id?: string
          is_active?: boolean | null
          level_name?: string
          level_number?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_login_streaks: {
        Row: {
          created_at: string | null
          current_streak: number | null
          id: string
          last_login_date: string | null
          longest_streak: number | null
          total_logins: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_login_date?: string | null
          longest_streak?: number | null
          total_logins?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_streak?: number | null
          id?: string
          last_login_date?: string | null
          longest_streak?: number | null
          total_logins?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_noble_subscriptions: {
        Row: {
          auto_renew: boolean
          cancelled_at: string | null
          created_at: string
          diamonds_spent: number
          expires_at: string
          id: string
          is_active: boolean
          last_reminder_sent_at: string | null
          noble_card_id: string
          reminders_sent: Json
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          diamonds_spent?: number
          expires_at: string
          id?: string
          is_active?: boolean
          last_reminder_sent_at?: string | null
          noble_card_id: string
          reminders_sent?: Json
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          cancelled_at?: string | null
          created_at?: string
          diamonds_spent?: number
          expires_at?: string
          id?: string
          is_active?: boolean
          last_reminder_sent_at?: string | null
          noble_card_id?: string
          reminders_sent?: Json
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_noble_subscriptions_noble_card_id_fkey"
            columns: ["noble_card_id"]
            isOneToOne: false
            referencedRelation: "noble_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      user_parcels: {
        Row: {
          actual_reward_amount: number | null
          actual_reward_type: string | null
          assigned_at: string
          claimed_at: string | null
          coins_amount: number
          created_at: string
          current_progress: number
          expires_at: string | null
          id: string
          opened_at: string | null
          parcel_template_id: string | null
          parcel_type: string
          required_progress: number
          source: string | null
          status: string
          template_id: string | null
          unlocks_at: string | null
          user_id: string
        }
        Insert: {
          actual_reward_amount?: number | null
          actual_reward_type?: string | null
          assigned_at?: string
          claimed_at?: string | null
          coins_amount?: number
          created_at?: string
          current_progress?: number
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          parcel_template_id?: string | null
          parcel_type?: string
          required_progress?: number
          source?: string | null
          status?: string
          template_id?: string | null
          unlocks_at?: string | null
          user_id: string
        }
        Update: {
          actual_reward_amount?: number | null
          actual_reward_type?: string | null
          assigned_at?: string
          claimed_at?: string | null
          coins_amount?: number
          created_at?: string
          current_progress?: number
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          parcel_template_id?: string | null
          parcel_type?: string
          required_progress?: number
          source?: string | null
          status?: string
          template_id?: string | null
          unlocks_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_parcels_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "parcel_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_purchased_backgrounds: {
        Row: {
          background_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          price_paid: number | null
          purchased_at: string
          user_id: string
        }
        Insert: {
          background_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          price_paid?: number | null
          purchased_at?: string
          user_id: string
        }
        Update: {
          background_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          price_paid?: number | null
          purchased_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_purchases: {
        Row: {
          currency_type: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_equipped: boolean | null
          item_id: string
          item_type: string
          price_paid: number
          purchased_at: string
          user_id: string
        }
        Insert: {
          currency_type?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_equipped?: boolean | null
          item_id: string
          item_type: string
          price_paid: number
          purchased_at?: string
          user_id: string
        }
        Update: {
          currency_type?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_equipped?: boolean | null
          item_id?: string
          item_type?: string
          price_paid?: number
          purchased_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          admin_notes: string | null
          created_at: string | null
          description: string | null
          evidence_urls: string[] | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          reason: string
          reported_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          admin_notes?: string | null
          created_at?: string | null
          description?: string | null
          evidence_urls?: string[] | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_frames: {
        Row: {
          assigned_at: string | null
          equipped: boolean | null
          expires_at: string | null
          frame_id: string
          id: string
          is_equipped: boolean | null
          notes: string | null
          purchased_at: string | null
          role_type: string | null
          source_table: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          equipped?: boolean | null
          expires_at?: string | null
          frame_id: string
          id?: string
          is_equipped?: boolean | null
          notes?: string | null
          purchased_at?: string | null
          role_type?: string | null
          source_table?: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          equipped?: boolean | null
          expires_at?: string | null
          frame_id?: string
          id?: string
          is_equipped?: boolean | null
          notes?: string | null
          purchased_at?: string | null
          role_type?: string | null
          source_table?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_frames_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "role_frames"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_frames_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          granted_at: string | null
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          granted_at?: string | null
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean | null
          created_at: string
          expires_at: string
          id: string
          plan_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string
          expires_at: string
          id?: string
          plan_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string
          expires_at?: string
          id?: string
          plan_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_task_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_count: number | null
          current_progress: number | null
          id: string
          is_claimed: boolean | null
          is_completed: boolean | null
          reset_date: string | null
          reward_claimed: boolean | null
          task_date: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_count?: number | null
          current_progress?: number | null
          id?: string
          is_claimed?: boolean | null
          is_completed?: boolean | null
          reset_date?: string | null
          reward_claimed?: boolean | null
          task_date?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_count?: number | null
          current_progress?: number | null
          id?: string
          is_claimed?: boolean | null
          is_completed?: boolean | null
          reset_date?: string | null
          reward_claimed?: boolean | null
          task_date?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_vip_medals: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          id: string
          is_displayed: boolean
          medal_id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          id?: string
          is_displayed?: boolean
          medal_id: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          id?: string
          is_displayed?: boolean
          medal_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_vip_medals_medal_id_fkey"
            columns: ["medal_id"]
            isOneToOne: false
            referencedRelation: "vip_medals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_vip_subscriptions: {
        Row: {
          amount_paid: number | null
          auto_renew: boolean | null
          created_at: string
          expires_at: string
          id: string
          is_active: boolean | null
          payment_method: string | null
          started_at: string
          updated_at: string
          user_id: string
          vip_tier_id: string
        }
        Insert: {
          amount_paid?: number | null
          auto_renew?: boolean | null
          created_at?: string
          expires_at: string
          id?: string
          is_active?: boolean | null
          payment_method?: string | null
          started_at?: string
          updated_at?: string
          user_id: string
          vip_tier_id: string
        }
        Update: {
          amount_paid?: number | null
          auto_renew?: boolean | null
          created_at?: string
          expires_at?: string
          id?: string
          is_active?: boolean | null
          payment_method?: string | null
          started_at?: string
          updated_at?: string
          user_id?: string
          vip_tier_id?: string
        }
        Relationships: []
      }
      vehicle_entrances: {
        Row: {
          animation_url: string | null
          category: string | null
          created_at: string | null
          display_order: number | null
          duration_ms: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_premium: boolean | null
          level_required: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          sound_url: string | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          sound_url?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          sound_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      violation_penalties: {
        Row: {
          beans_amount: number | null
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          penalty_type: string
          updated_at: string | null
          violation_number: number
        }
        Insert: {
          beans_amount?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          penalty_type: string
          updated_at?: string | null
          violation_number: number
        }
        Update: {
          beans_amount?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          penalty_type?: string
          updated_at?: string | null
          violation_number?: number
        }
        Relationships: []
      }
      violation_penalty_tiers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          occurrence_number: number
          penalty_action: string
          penalty_duration_hours: number | null
          violation_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          occurrence_number: number
          penalty_action: string
          penalty_duration_hours?: number | null
          violation_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          occurrence_number?: number
          penalty_action?: string
          penalty_duration_hours?: number | null
          violation_type?: string
        }
        Relationships: []
      }
      vip_daily_rewards_log: {
        Row: {
          claim_date: string
          claimed_at: string
          diamonds_awarded: number
          id: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          claim_date?: string
          claimed_at?: string
          diamonds_awarded: number
          id?: string
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          claim_date?: string
          claimed_at?: string
          diamonds_awarded?: number
          id?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      vip_exclusive_items: {
        Row: {
          created_at: string
          discount_percent: number | null
          id: string
          is_active: boolean | null
          is_free: boolean | null
          item_id: string
          item_type: string
          min_vip_tier: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          item_id: string
          item_type: string
          min_vip_tier?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_percent?: number | null
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          item_id?: string
          item_type?: string
          min_vip_tier?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      vip_medals: {
        Row: {
          animation_url: string | null
          created_at: string
          criteria_type: string | null
          criteria_value: number | null
          description: string | null
          display_order: number
          icon_url: string | null
          id: string
          is_active: boolean
          medal_code: string
          medal_name: string
          rarity: string
          updated_at: string
        }
        Insert: {
          animation_url?: string | null
          created_at?: string
          criteria_type?: string | null
          criteria_value?: number | null
          description?: string | null
          display_order?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          medal_code: string
          medal_name: string
          rarity?: string
          updated_at?: string
        }
        Update: {
          animation_url?: string | null
          created_at?: string
          criteria_type?: string | null
          criteria_value?: number | null
          description?: string | null
          display_order?: number
          icon_url?: string | null
          id?: string
          is_active?: boolean
          medal_code?: string
          medal_name?: string
          rarity?: string
          updated_at?: string
        }
        Relationships: []
      }
      vip_perks: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          plan_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          plan_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          plan_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_perks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vip_perks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_recharge_bonus_log: {
        Row: {
          applied_at: string
          base_diamonds: number
          bonus_diamonds: number
          bonus_percent: number
          id: string
          recharge_id: string | null
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          base_diamonds: number
          bonus_diamonds: number
          bonus_percent: number
          id?: string
          recharge_id?: string | null
          source_id?: string | null
          source_type: string
          user_id: string
        }
        Update: {
          applied_at?: string
          base_diamonds?: number
          bonus_diamonds?: number
          bonus_percent?: number
          id?: string
          recharge_id?: string | null
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: []
      }
      vip_tiers: {
        Row: {
          ad_free: boolean | null
          anti_kick_protection: boolean
          badge_animation_url: string | null
          badge_color: string | null
          badge_url: string | null
          benefits: Json | null
          bubble_animation_url: string | null
          created_at: string
          daily_free_diamonds: number
          description: string | null
          display_order: number | null
          duration_days: number | null
          entrance_url: string | null
          entry_animation_url: string | null
          entry_effect_duration_seconds: number
          exclusive_bubbles: boolean | null
          exclusive_entry_bars: boolean | null
          exclusive_frames: boolean | null
          exclusive_gifts: boolean | null
          exclusive_stickers: boolean | null
          faster_support: boolean | null
          forbidden_words_bypass: boolean
          frame_animation_url: string | null
          frame_url: string | null
          free_name_changes_per_month: number
          hide_real_level: boolean
          id: string
          is_active: boolean | null
          max_kick_tier_level: number
          price_diamonds: number | null
          price_monthly: number
          price_yearly: number | null
          priority_matching: boolean | null
          priority_random_match: boolean
          profile_background_url: string | null
          profile_highlight: boolean | null
          recharge_bonus_percent: number
          stealth_mode: boolean
          subscription_type: string
          tier_code: string | null
          tier_level: number
          tier_name: string
          top_position_in_lists: boolean
          updated_at: string
          username_color: string | null
          vip_only_lounge_access: boolean
          vip_only_rooms: boolean | null
        }
        Insert: {
          ad_free?: boolean | null
          anti_kick_protection?: boolean
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string
          daily_free_diamonds?: number
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          entry_effect_duration_seconds?: number
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          forbidden_words_bypass?: boolean
          frame_animation_url?: string | null
          frame_url?: string | null
          free_name_changes_per_month?: number
          hide_real_level?: boolean
          id?: string
          is_active?: boolean | null
          max_kick_tier_level?: number
          price_diamonds?: number | null
          price_monthly: number
          price_yearly?: number | null
          priority_matching?: boolean | null
          priority_random_match?: boolean
          profile_background_url?: string | null
          profile_highlight?: boolean | null
          recharge_bonus_percent?: number
          stealth_mode?: boolean
          subscription_type?: string
          tier_code?: string | null
          tier_level: number
          tier_name: string
          top_position_in_lists?: boolean
          updated_at?: string
          username_color?: string | null
          vip_only_lounge_access?: boolean
          vip_only_rooms?: boolean | null
        }
        Update: {
          ad_free?: boolean | null
          anti_kick_protection?: boolean
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string
          daily_free_diamonds?: number
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          entry_effect_duration_seconds?: number
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          forbidden_words_bypass?: boolean
          frame_animation_url?: string | null
          frame_url?: string | null
          free_name_changes_per_month?: number
          hide_real_level?: boolean
          id?: string
          is_active?: boolean | null
          max_kick_tier_level?: number
          price_diamonds?: number | null
          price_monthly?: number
          price_yearly?: number | null
          priority_matching?: boolean | null
          priority_random_match?: boolean
          profile_background_url?: string | null
          profile_highlight?: boolean | null
          recharge_bonus_percent?: number
          stealth_mode?: boolean
          subscription_type?: string
          tier_code?: string | null
          tier_level?: number
          tier_name?: string
          top_position_in_lists?: boolean
          updated_at?: string
          username_color?: string | null
          vip_only_lounge_access?: boolean
          vip_only_rooms?: boolean | null
        }
        Relationships: []
      }
      vpn_detection_logs: {
        Row: {
          action_taken: string | null
          city: string | null
          country_code: string | null
          created_at: string
          id: string
          ip_address: string
          is_vpn: boolean | null
          isp: string | null
          user_id: string | null
          vpn_provider: string | null
        }
        Insert: {
          action_taken?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address: string
          is_vpn?: boolean | null
          isp?: string | null
          user_id?: string | null
          vpn_provider?: string | null
        }
        Update: {
          action_taken?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          id?: string
          ip_address?: string
          is_vpn?: boolean | null
          isp?: string | null
          user_id?: string | null
          vpn_provider?: string | null
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          added_at: string
          content_id: string
          content_type: string
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          content_id: string
          content_type: string
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          content_id?: string
          content_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      welcome_bonuses: {
        Row: {
          bonus_amount: number
          bonus_type: string
          claimed: boolean | null
          claimed_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          bonus_amount: number
          bonus_type: string
          claimed?: boolean | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          bonus_amount?: number
          bonus_type?: string
          claimed?: boolean | null
          claimed_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_sources: {
        Row: {
          auto_fetch: boolean | null
          category: string | null
          channel_id: string | null
          channel_name: string
          channel_url: string
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          last_fetched_at: string | null
          updated_at: string
        }
        Insert: {
          auto_fetch?: boolean | null
          category?: string | null
          channel_id?: string | null
          channel_name: string
          channel_url: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          updated_at?: string
        }
        Update: {
          auto_fetch?: boolean | null
          category?: string | null
          channel_id?: string | null
          channel_name?: string
          channel_url?: string
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      agencies_public: {
        Row: {
          agency_code: string | null
          created_at: string | null
          diamond_balance: number | null
          id: string | null
          is_active: boolean | null
          level: string | null
          logo_url: string | null
          name: string | null
          owner_id: string | null
          parent_agency_id: string | null
          total_agents: number | null
          total_hosts: number | null
        }
        Insert: {
          agency_code?: string | null
          created_at?: string | null
          diamond_balance?: number | null
          id?: string | null
          is_active?: boolean | null
          level?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          parent_agency_id?: string | null
          total_agents?: number | null
          total_hosts?: number | null
        }
        Update: {
          agency_code?: string | null
          created_at?: string | null
          diamond_balance?: number | null
          id?: string | null
          is_active?: boolean | null
          level?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          parent_agency_id?: string | null
          total_agents?: number | null
          total_hosts?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_traders: {
        Row: {
          created_at: string | null
          id: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          wallet_balance: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          status?: never
          updated_at?: string | null
          user_id?: string | null
          wallet_balance?: never
        }
        Update: {
          created_at?: string | null
          id?: string | null
          status?: never
          updated_at?: string | null
          user_id?: string | null
          wallet_balance?: never
        }
        Relationships: [
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_rounds_stats: {
        Row: {
          active_rounds: number | null
          game_emoji: string | null
          game_id: string | null
          game_name: string | null
          last_round_at: string | null
          total_players: number | null
          total_rounds: number | null
          total_wagered: number | null
        }
        Relationships: []
      }
      game_winner_ticker: {
        Row: {
          amount: number | null
          avatar_url: string | null
          created_at: string | null
          game_type: string | null
          id: string | null
          name: string | null
          result_data: Json | null
          user_id: string | null
        }
        Relationships: []
      }
      gift_items: {
        Row: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          category_id: string | null
          coin_price: number | null
          coin_value: number | null
          created_at: string | null
          display_order: number | null
          duration_days: number | null
          icon_url: string | null
          id: string | null
          is_active: boolean | null
          is_full_screen: boolean | null
          is_lucky: boolean | null
          lottie_url: string | null
          min_level: number | null
          name: string | null
          preview_url: string | null
          price_diamonds: number | null
          receiver_beans: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          tier: number | null
        }
        Insert: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_price?: number | null
          coin_value?: number | null
          created_at?: string | null
          display_order?: number | null
          duration_days?: number | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_full_screen?: boolean | null
          is_lucky?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name?: string | null
          preview_url?: string | null
          price_diamonds?: number | null
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tier?: number | null
        }
        Update: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_price?: number | null
          coin_value?: number | null
          created_at?: string | null
          display_order?: number | null
          duration_days?: number | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_full_screen?: boolean | null
          is_lucky?: boolean | null
          lottie_url?: string | null
          min_level?: number | null
          name?: string | null
          preview_url?: string | null
          price_diamonds?: number | null
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
          tier?: number | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          age: number | null
          agency_id: string | null
          app_uid: string | null
          avatar_url: string | null
          bio: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_rate_per_minute: number | null
          city: string | null
          country_code: string | null
          country_flag: string | null
          country_name: string | null
          cover_url: string | null
          created_at: string | null
          current_vip_tier_id: string | null
          display_name: string | null
          equipped_bubble_id: string | null
          equipped_entrance_id: string | null
          equipped_entry_banner_id: string | null
          equipped_entry_name_bar_id: string | null
          equipped_frame_id: string | null
          equipped_medal_id: string | null
          equipped_noble_card_id: string | null
          equipped_vehicle_id: string | null
          face_verification_status: string | null
          face_verified_at: string | null
          frame_id: string | null
          gender: string | null
          hide_location: boolean | null
          host_availability: string | null
          host_level: number | null
          host_photos: string[] | null
          host_status: string | null
          host_verified_at: string | null
          id: string | null
          is_agency_owner: boolean | null
          is_banned: boolean | null
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_face_verified: boolean | null
          is_host: boolean | null
          is_in_call: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          last_active_at: string | null
          last_seen: string | null
          last_seen_at: string | null
          max_user_level: number | null
          profile_photo_url: string | null
          region: string | null
          tags: string[] | null
          total_call_minutes: number | null
          total_calls_received: number | null
          total_earnings: number | null
          user_level: number | null
          username: string | null
          verification_type: string | null
          vip_expires_at: string | null
          vip_tier: number | null
          weekly_earnings: number | null
        }
        Insert: {
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_vip_tier_id?: string | null
          display_name?: string | null
          equipped_bubble_id?: string | null
          equipped_entrance_id?: string | null
          equipped_entry_banner_id?: string | null
          equipped_entry_name_bar_id?: string | null
          equipped_frame_id?: string | null
          equipped_medal_id?: string | null
          equipped_noble_card_id?: string | null
          equipped_vehicle_id?: string | null
          face_verification_status?: string | null
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean | null
          host_availability?: string | null
          host_level?: number | null
          host_photos?: string[] | null
          host_status?: string | null
          host_verified_at?: string | null
          id?: string | null
          is_agency_owner?: boolean | null
          is_banned?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          last_seen?: string | null
          last_seen_at?: string | null
          max_user_level?: number | null
          profile_photo_url?: string | null
          region?: string | null
          tags?: string[] | null
          total_call_minutes?: number | null
          total_calls_received?: number | null
          total_earnings?: number | null
          user_level?: number | null
          username?: string | null
          verification_type?: string | null
          vip_expires_at?: string | null
          vip_tier?: number | null
          weekly_earnings?: number | null
        }
        Update: {
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          country_code?: string | null
          country_flag?: string | null
          country_name?: string | null
          cover_url?: string | null
          created_at?: string | null
          current_vip_tier_id?: string | null
          display_name?: string | null
          equipped_bubble_id?: string | null
          equipped_entrance_id?: string | null
          equipped_entry_banner_id?: string | null
          equipped_entry_name_bar_id?: string | null
          equipped_frame_id?: string | null
          equipped_medal_id?: string | null
          equipped_noble_card_id?: string | null
          equipped_vehicle_id?: string | null
          face_verification_status?: string | null
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean | null
          host_availability?: string | null
          host_level?: number | null
          host_photos?: string[] | null
          host_status?: string | null
          host_verified_at?: string | null
          id?: string | null
          is_agency_owner?: boolean | null
          is_banned?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          last_seen?: string | null
          last_seen_at?: string | null
          max_user_level?: number | null
          profile_photo_url?: string | null
          region?: string | null
          tags?: string[] | null
          total_call_minutes?: number | null
          total_calls_received?: number | null
          total_earnings?: number | null
          user_level?: number | null
          username?: string | null
          verification_type?: string | null
          vip_expires_at?: string | null
          vip_tier?: number | null
          weekly_earnings?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_packages: {
        Row: {
          bonus_coins: number | null
          coins_amount: number | null
          created_at: string | null
          description: string | null
          discount_percent: number | null
          display_order: number | null
          icon_url: string | null
          id: string | null
          is_active: boolean | null
          is_popular: boolean | null
          name: string | null
          price_usd: number | null
          product_id: string | null
          updated_at: string | null
        }
        Insert: {
          bonus_coins?: number | null
          coins_amount?: number | null
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string | null
          price_usd?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bonus_coins?: number | null
          coins_amount?: number | null
          created_at?: string | null
          description?: string | null
          discount_percent?: number | null
          display_order?: number | null
          icon_url?: string | null
          id?: string | null
          is_active?: boolean | null
          is_popular?: boolean | null
          name?: string | null
          price_usd?: number | null
          product_id?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      topup_helpers_public: {
        Row: {
          id: string | null
          is_active: boolean | null
          is_verified: boolean | null
          payroll_enabled: boolean | null
          trader_level: number | null
          user_id: string | null
        }
        Insert: {
          id?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          payroll_enabled?: boolean | null
          trader_level?: number | null
          user_id?: string | null
        }
        Update: {
          id?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          payroll_enabled?: boolean | null
          trader_level?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_plans: {
        Row: {
          ad_free: boolean | null
          anti_kick_protection: boolean | null
          badge_animation_url: string | null
          badge_color: string | null
          badge_url: string | null
          benefits: Json | null
          bubble_animation_url: string | null
          created_at: string | null
          daily_free_diamonds: number | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          entrance_url: string | null
          entry_animation_url: string | null
          entry_effect_duration_seconds: number | null
          exclusive_bubbles: boolean | null
          exclusive_entry_bars: boolean | null
          exclusive_frames: boolean | null
          exclusive_gifts: boolean | null
          exclusive_stickers: boolean | null
          faster_support: boolean | null
          forbidden_words_bypass: boolean | null
          frame_animation_url: string | null
          frame_url: string | null
          free_name_changes_per_month: number | null
          hide_real_level: boolean | null
          id: string | null
          is_active: boolean | null
          max_kick_tier_level: number | null
          price_diamonds: number | null
          price_monthly: number | null
          price_yearly: number | null
          priority_matching: boolean | null
          priority_random_match: boolean | null
          profile_background_url: string | null
          profile_highlight: boolean | null
          recharge_bonus_percent: number | null
          stealth_mode: boolean | null
          subscription_type: string | null
          tier_code: string | null
          tier_level: number | null
          tier_name: string | null
          top_position_in_lists: boolean | null
          updated_at: string | null
          username_color: string | null
          vip_only_lounge_access: boolean | null
          vip_only_rooms: boolean | null
        }
        Insert: {
          ad_free?: boolean | null
          anti_kick_protection?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string | null
          daily_free_diamonds?: number | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          entry_effect_duration_seconds?: number | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          forbidden_words_bypass?: boolean | null
          frame_animation_url?: string | null
          frame_url?: string | null
          free_name_changes_per_month?: number | null
          hide_real_level?: boolean | null
          id?: string | null
          is_active?: boolean | null
          max_kick_tier_level?: number | null
          price_diamonds?: number | null
          price_monthly?: number | null
          price_yearly?: number | null
          priority_matching?: boolean | null
          priority_random_match?: boolean | null
          profile_background_url?: string | null
          profile_highlight?: boolean | null
          recharge_bonus_percent?: number | null
          stealth_mode?: boolean | null
          subscription_type?: string | null
          tier_code?: string | null
          tier_level?: number | null
          tier_name?: string | null
          top_position_in_lists?: boolean | null
          updated_at?: string | null
          username_color?: string | null
          vip_only_lounge_access?: boolean | null
          vip_only_rooms?: boolean | null
        }
        Update: {
          ad_free?: boolean | null
          anti_kick_protection?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string | null
          daily_free_diamonds?: number | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          entry_effect_duration_seconds?: number | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          forbidden_words_bypass?: boolean | null
          frame_animation_url?: string | null
          frame_url?: string | null
          free_name_changes_per_month?: number | null
          hide_real_level?: boolean | null
          id?: string | null
          is_active?: boolean | null
          max_kick_tier_level?: number | null
          price_diamonds?: number | null
          price_monthly?: number | null
          price_yearly?: number | null
          priority_matching?: boolean | null
          priority_random_match?: boolean | null
          profile_background_url?: string | null
          profile_highlight?: boolean | null
          recharge_bonus_percent?: number | null
          stealth_mode?: boolean | null
          subscription_type?: string | null
          tier_code?: string | null
          tier_level?: number | null
          tier_name?: string | null
          top_position_in_lists?: boolean | null
          updated_at?: string | null
          username_color?: string | null
          vip_only_lounge_access?: boolean | null
          vip_only_rooms?: boolean | null
        }
        Relationships: []
      }
    }
    Functions: {
      _current_admin_display: { Args: never; Returns: string }
      _current_admin_role: { Args: never; Returns: string }
      _enqueue_admin_pending_action: {
        Args: {
          _action_type: string
          _payload: Json
          _reason: string
          _target_agency: string
          _target_user: string
        }
        Returns: string
      }
      _execute_admin_pending_action: {
        Args: { _action_type: string; _payload: Json }
        Returns: Json
      }
      _internal_add_beans: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      _internal_add_coins: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      _internal_add_diamonds:
        | { Args: { _amount: number; _user_id: string }; Returns: undefined }
        | { Args: { _amount: number; _user_id: string }; Returns: undefined }
      _resolve_private_call_coins_per_minute: {
        Args: { p_host_id: string }
        Returns: number
      }
      accept_private_call: { Args: { _call_id: string }; Returns: boolean }
      add_beans_to_host: {
        Args: {
          p_beans_amount: number
          p_host_id: string
          p_host_level?: number
          p_total_earnings?: number
        }
        Returns: undefined
      }
      add_beans_to_user: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      add_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      add_coins_to_user: {
        Args: { _amount: number; _user_id: string }
        Returns: undefined
      }
      add_diamonds_to_agency: {
        Args: { _agency_id: string; _amount: number }
        Returns: undefined
      }
      add_diamonds_to_user: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      add_to_helper_wallet: {
        Args: { _amount: number; _helper_id: string }
        Returns: undefined
      }
      admin_add_agency_coins: {
        Args: { _agency_id: string; _amount: number; _note?: string }
        Returns: Json
      }
      admin_add_owner: {
        Args: { _admin_id: string; _display_name?: string; _new_email: string }
        Returns: Json
      }
      admin_add_user_coins: {
        Args: { _amount: number; _note?: string; _user_id: string }
        Returns: Json
      }
      admin_add_violation: {
        Args: {
          p_admin_id: string
          p_detected_content: string
          p_detected_pattern: string
          p_host_id: string
          p_notes?: string
          p_source_type: string
        }
        Returns: Json
      }
      admin_adjust_agency_beans: {
        Args: { _agency_id: string; _delta: number; _reason?: string }
        Returns: Json
      }
      admin_agency_overview_stats: { Args: never; Returns: Json }
      admin_apply_severity_ban: {
        Args: {
          _duration_value?: number
          _evidence?: Json
          _reason?: string
          _severity: string
          _target_user_id: string
        }
        Returns: Json
      }
      admin_approve_device: {
        Args: { _device_id: string; _owner_admin_id: string }
        Returns: Json
      }
      admin_approve_helper: { Args: { _helper_id: string }; Returns: boolean }
      admin_approve_pending_action: {
        Args: { _id: string; _notes?: string }
        Returns: Json
      }
      admin_authenticate: {
        Args: { _email: string; _password: string }
        Returns: Json
      }
      admin_block_agency: {
        Args: { _agency_id: string; _block: boolean; _reason?: string }
        Returns: Json
      }
      admin_block_user: {
        Args: {
          _ban_device?: boolean
          _block: boolean
          _reason?: string
          _user_id: string
        }
        Returns: undefined
      }
      admin_change_own_password: {
        Args: { p_admin_user_id: string; p_new_password: string }
        Returns: Json
      }
      admin_change_user_role: {
        Args: { _new_role: string; _user_id: string }
        Returns: boolean
      }
      admin_check_device_status: {
        Args: { _admin_id: string; _device_fingerprint: string }
        Returns: Json
      }
      admin_check_live_ban: { Args: { p_user_id: string }; Returns: boolean }
      admin_clear_frame_references: {
        Args: { frame_id_to_clear: string }
        Returns: Json
      }
      admin_convert_user_role: {
        Args: { _to_host: boolean; _user_id: string }
        Returns: boolean
      }
      admin_country_distribution: {
        Args: { _admin_id: string }
        Returns: {
          country_code: string
          country_flag: string
          country_name: string
          total: number
        }[]
      }
      admin_create_agency: {
        Args: {
          _agency_code: string
          _commission_rate?: number
          _level?: string
          _name: string
          _owner_id: string
        }
        Returns: string
      }
      admin_credit_beans: {
        Args: { _log_id: string; _notes?: string }
        Returns: Json
      }
      admin_delete_agency_policy: {
        Args: { _admin_id: string; _id: string }
        Returns: undefined
      }
      admin_delete_party_background: {
        Args: { _admin_id: string; _id: string }
        Returns: Json
      }
      admin_delete_recording: {
        Args: { _admin_id: string; _recording_id: string }
        Returns: undefined
      }
      admin_delete_reel: {
        Args: { _admin_id: string; _reel_id: string }
        Returns: undefined
      }
      admin_delete_user: { Args: { _user_id: string }; Returns: Json }
      admin_end_stream: {
        Args: { _admin_id: string; _stream_id: string }
        Returns: undefined
      }
      admin_entry_effects_stats: { Args: never; Returns: Json }
      admin_face_verification_stats: { Args: never; Returns: Json }
      admin_finance_overview_stats: { Args: never; Returns: Json }
      admin_force_verify_and_approve_host: {
        Args: {
          _approve_as?: string
          _reason?: string
          _set_gender?: string
          _user_id: string
        }
        Returns: Json
      }
      admin_game_today_stats: {
        Args: never
        Returns: {
          game_id: string
          house_profit: number
          total_bet_amount: number
          total_bets: number
          total_win_amount: number
          total_wins: number
        }[]
      }
      admin_get_user_full_details: { Args: { _user_id: string }; Returns: Json }
      admin_gift_frame_to_user: {
        Args: {
          p_expires_at?: string
          p_frame_id: string
          p_notes?: string
          p_source_table?: string
          p_user_id: string
        }
        Returns: Json
      }
      admin_helper_applications_stats: { Args: never; Returns: Json }
      admin_helper_management_stats: { Args: never; Returns: Json }
      admin_helper_requests_stats: { Args: never; Returns: Json }
      admin_host_stats: { Args: never; Returns: Json }
      admin_list_admin_users: {
        Args: { _include_inactive?: boolean }
        Returns: {
          accepted_at: string
          created_at: string
          display_name: string
          email: string
          id: string
          invited_at: string
          is_active: boolean
          last_login_at: string
          normalized_display_name: string
          role: string
          user_id: string
        }[]
      }
      admin_list_avatar_frames_all: {
        Args: never
        Returns: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          frame_type: string | null
          frame_url: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean | null
          level_required: number | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          target_type: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "avatar_frames"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_blocked_agencies: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          agency_code: string
          blocked_at: string
          blocked_reason: string
          id: string
          name: string
          owner_avatar_url: string
          owner_display_name: string
          owner_id: string
          total_hosts: number
        }[]
      }
      admin_list_blocked_users: {
        Args: { _limit?: number; _search?: string }
        Returns: {
          avatar_url: string
          blocked_at: string
          blocked_reason: string
          display_name: string
          id: string
          is_host: boolean
        }[]
      }
      admin_list_chat_bubbles_all: {
        Args: never
        Returns: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_ms: number | null
          icon_bg_color: string | null
          icon_color: string | null
          icon_name: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level: number
          name: string | null
          preview_url: string | null
          privilege_key: string
          privilege_name: string
          privilege_type: string | null
          sound_url: string | null
          unlock_level: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "level_privileges"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_chat_moderation_logs_paginated: {
        Args: { _filter_type?: string; _page?: number; _page_size?: number }
        Returns: Json
      }
      admin_list_entry_banners_all: {
        Args: never
        Returns: {
          animation_url: string | null
          created_at: string | null
          display_order: number | null
          duration: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_premium: boolean | null
          level_required: number | null
          name: string
          price_coins: number | null
          price_diamonds: number | null
          sound_url: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "entry_banners"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_face_verification_paginated: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      admin_list_face_violations: {
        Args: { _admin_id?: string; _limit?: number }
        Returns: {
          action_taken: string
          admin_reviewed: boolean
          app_uid: string
          auto_closed: boolean
          avatar_url: string
          confidence: number
          countdown_duration: number
          created_at: string
          detected_at: string
          display_name: string
          frame_url: string
          host_id: string
          id: string
          notes: string
          reviewed_at: string
          reviewed_by: string
          status: string
          stream_id: string
          violation_type: string
        }[]
      }
      admin_list_gifts_all: {
        Args: never
        Returns: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          category_id: string | null
          coin_price: number | null
          coin_value: number
          created_at: string | null
          display_order: number | null
          duration_days: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_full_screen: boolean | null
          is_lucky: boolean | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          receiver_beans: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          tier: number
        }[]
        SetofOptions: {
          from: "*"
          to: "gifts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_helper_applications: {
        Args: { _admin_id: string; _status?: string }
        Returns: {
          country_code: string
          created_at: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          whatsapp_number: string
        }[]
        SetofOptions: {
          from: "*"
          to: "helper_applications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_helper_orders:
        | {
            Args: { _admin_id: string; _limit?: number }
            Returns: {
              amount_local: number | null
              amount_usd: number | null
              coin_amount: number | null
              commission_amount: number | null
              commission_rate: number | null
              created_at: string | null
              currency_code: string | null
              customer_id: string | null
              diamond_amount: number | null
              helper_id: string
              id: string
              local_currency: string | null
              local_price: number | null
              notes: string | null
              package_id: string
              payment_details: Json
              payment_method: string | null
              payment_proof_url: string | null
              processed_at: string | null
              processing_time_minutes: number | null
              status: string | null
              total_price_usd: number | null
              updated_at: string | null
              user_country_code: string | null
              user_id: string | null
              user_payment_proof: string | null
            }[]
            SetofOptions: {
              from: "*"
              to: "helper_orders"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { _limit?: number; _search?: string; _status?: string }
            Returns: {
              amount_local: number
              amount_usd: number
              coin_amount: number
              created_at: string
              currency_code: string
              customer_app_uid: string
              customer_avatar_url: string
              customer_display_name: string
              customer_id: string
              helper_app_uid: string
              helper_avatar_url: string
              helper_display_name: string
              helper_id: string
              helper_notes: string
              helper_user_id: string
              helper_wallet_balance: number
              id: string
              payment_method: string
              processed_at: string
              status: string
              user_country_code: string
              user_id: string
              user_payment_proof: string
            }[]
          }
      admin_list_helper_topup_requests: {
        Args: { _admin_id: string }
        Returns: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          helper_id: string
          id: string
          payment_method: string | null
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          status: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "helper_topup_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_helper_upgrade_requests: {
        Args: { _admin_id: string }
        Returns: {
          admin_notes: string | null
          created_at: string | null
          current_level: number | null
          helper_id: string
          id: string
          requested_level: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "helper_upgrade_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_hosts_paginated: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: Json
      }
      admin_list_live_bans: {
        Args: { _limit?: number; _only_active?: boolean }
        Returns: {
          auto_banned: boolean | null
          ban_duration_hours: number | null
          ban_end: string | null
          ban_reason: string | null
          ban_start: string | null
          ban_type: string | null
          banned_by: string | null
          created_at: string | null
          device_banned: boolean | null
          expires_at: string | null
          face_hash_banned: boolean | null
          id: string
          ip_banned: boolean | null
          is_active: boolean | null
          reason: string | null
          severity: string | null
          stream_id: string | null
          unban_reason: string | null
          unbanned_at: string | null
          unbanned_by: string | null
          user_id: string
          violation_type: string | null
          warning_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "live_bans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_live_face_warnings_paginated: {
        Args: {
          p_event?: string
          p_host_id?: string
          p_page?: number
          p_page_size?: number
        }
        Returns: Json
      }
      admin_list_online_users: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: Json
      }
      admin_list_owners: {
        Args: { _admin_id: string }
        Returns: {
          created_at: string
          display_name: string
          email: string
          is_active: boolean
        }[]
      }
      admin_list_party_backgrounds: {
        Args: { _admin_id: string }
        Returns: {
          category: string | null
          created_at: string | null
          display_order: number | null
          gradient_css: string | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean | null
          min_level: number
          name: string
          price_coins: number | null
          price_diamonds: number | null
          thumbnail_url: string | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "party_room_backgrounds"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_pending_actions: {
        Args: { _limit?: number; _status?: string }
        Returns: {
          action_type: string
          created_at: string
          executed_result: Json | null
          id: string
          owner_notes: string | null
          payload: Json
          reason: string | null
          requested_by: string
          requested_by_name: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_name: string | null
          status: string
          target_agency_id: string | null
          target_user_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_pending_actions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_pending_devices: {
        Args: { _owner_admin_id: string }
        Returns: {
          admin_display_name: string
          admin_email: string
          admin_role: string
          admin_user_id: string
          approved_at: string
          device_fingerprint: string
          device_info: Json
          device_name: string
          id: string
          ip_address: string
          last_used_at: string
          rejected_at: string
          requested_at: string
          status: string
          user_agent: string
        }[]
      }
      admin_list_recordings: {
        Args: { _admin_id: string; _limit?: number }
        Returns: {
          channel_name: string | null
          created_at: string | null
          duration_seconds: number | null
          ended_at: string | null
          expires_at: string | null
          file_size_bytes: number | null
          host_id: string | null
          host_name: string | null
          host_uid: string | null
          id: string
          metadata: Json | null
          recording_sid: string | null
          recording_url: string | null
          resource_id: string | null
          started_at: string | null
          status: string | null
          stream_id: string | null
          thumbnail_url: string | null
          total_coins: number | null
          total_gifts: number | null
          total_viewers: number | null
          updated_at: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "stream_recordings"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_reels: {
        Args: { _admin_id: string; _limit?: number }
        Returns: {
          beans_earned: number | null
          caption: string | null
          category_id: string | null
          comment_count: number
          comments_count: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          is_original_sound: boolean | null
          is_public: boolean | null
          like_count: number | null
          likes_count: number | null
          music_artist: string | null
          music_id: string | null
          music_title: string | null
          share_count: number
          shares_count: number | null
          sound_artist: string | null
          sound_audio_url: string | null
          sound_id: string | null
          sound_title: string | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_url: string
          view_count: number | null
          views_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "reels"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_role_frames_all: {
        Args: never
        Returns: {
          animation_type: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          frame_url: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          lottie_url: string | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          role_type: string
          svga_url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "role_frames"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_severity_bans: {
        Args: { _limit?: number; _severity: string }
        Returns: {
          app_uid: string
          avatar_url: string
          created_at: string
          display_name: string
          duration_value: number
          evidence: Json
          id: string
          reason: string
          severity: string
          status: string
          target_user_id: string
        }[]
      }
      admin_list_shop_items_all: {
        Args: never
        Returns: {
          animation_file_url: string | null
          animation_type: string | null
          animation_url: string | null
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_days: number | null
          file_type: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          is_permanent: boolean | null
          is_premium: boolean | null
          is_vip_exclusive: boolean | null
          item_type: string
          level_required: number | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          rarity: string | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
          tag: string | null
          total_sold: number | null
          updated_at: string
          vip_discount_percent: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "shop_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_streams: {
        Args: { _admin_id: string; _limit?: number }
        Returns: {
          category_id: string | null
          created_at: string | null
          current_music_title: string | null
          current_music_url: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_active: boolean | null
          last_heartbeat: string | null
          live_password_hash: string | null
          live_privacy: string
          music_playing: boolean | null
          music_started_at: string | null
          room_id: string | null
          started_at: string | null
          status: string | null
          stream_type: string | null
          thumbnail_url: string | null
          title: string | null
          total_coins_earned: number | null
          total_gifts: number | null
          viewer_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "live_streams"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_support_reports: {
        Args: { _limit?: number; _offset?: number; _status?: string }
        Returns: {
          created_at: string
          id: string
          message_content: string
          message_id: string
          owner_notes: string
          reason: string
          reported_by_admin_id: string
          reported_by_admin_name: string
          reviewed_at: string
          status: string
          ticket_id: string
          ticket_subject: string
          user_app_uid: string
          user_display_name: string
          user_id: string
        }[]
      }
      admin_list_topup_helpers: {
        Args: { _admin_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          auto_receive_orders: boolean | null
          buy_rate: number | null
          commission_rate: number | null
          contact_info: Json | null
          country_code: string | null
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          order_notification_email: string | null
          order_notification_phone: string | null
          payment_credentials: Json | null
          payroll_applied_at: string | null
          payroll_approved_at: string | null
          payroll_approved_by: string | null
          payroll_enabled: boolean | null
          payroll_status: string | null
          sell_rate: number | null
          supported_countries: string[] | null
          total_bought: number | null
          total_earnings: number | null
          total_level_upgrade_cost: number | null
          total_sold: number | null
          trader_level: number | null
          updated_at: string | null
          user_id: string
          wallet_balance: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "topup_helpers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_list_user_reports: {
        Args: { _admin_id: string; _limit?: number; _status?: string }
        Returns: {
          admin_notes: string | null
          created_at: string | null
          description: string | null
          evidence_urls: string[] | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "user_reports"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_live_ban_stats: { Args: never; Returns: Json }
      admin_live_face_warnings_stats: {
        Args: { p_days?: number }
        Returns: Json
      }
      admin_logout: { Args: { _token: string }; Returns: undefined }
      admin_moderation_overview_stats: { Args: never; Returns: Json }
      admin_party_management_stats: { Args: never; Returns: Json }
      admin_payment_gateway_stats: { Args: never; Returns: Json }
      admin_payroll_orders_stats: { Args: never; Returns: Json }
      admin_permanent_ban_step_one: {
        Args: {
          _evidence?: Json
          _include_gift_links?: boolean
          _lookback_days?: number
          _reason: string
          _target_user_id: string
        }
        Returns: string
      }
      admin_permanent_ban_step_three: {
        Args: { _case_id: string }
        Returns: Json
      }
      admin_permanent_ban_step_two: {
        Args: { _case_id: string; _review_note?: string }
        Returns: Json
      }
      admin_pin_device_trusted: {
        Args: { _device_fingerprint: string }
        Returns: Json
      }
      admin_pin_request_reset: { Args: never; Returns: Json }
      admin_pin_reset_with_otp: {
        Args: { _new_pin: string; _otp: string }
        Returns: Json
      }
      admin_pin_set: {
        Args: { _admin_id: string; _current_pin?: string; _new_pin: string }
        Returns: Json
      }
      admin_pin_status: { Args: never; Returns: Json }
      admin_pin_verify: {
        Args: {
          _device_fingerprint: string
          _pin: string
          _user_agent?: string
        }
        Returns: Json
      }
      admin_process_face_verification: {
        Args: {
          _action: string
          _approve_as?: string
          _reason?: string
          _set_gender?: string
          _submission_id: string
        }
        Returns: Json
      }
      admin_process_helper_transaction: {
        Args: { _action: string; _transaction_id: string }
        Returns: boolean
      }
      admin_process_host_application: {
        Args: {
          _application_id: string
          _processed_by: string
          _status: string
        }
        Returns: Json
      }
      admin_process_withdrawal: {
        Args: { _notes?: string; _status: string; _withdrawal_id: string }
        Returns: Json
      }
      admin_reject_pending_action: {
        Args: { _id: string; _notes?: string }
        Returns: Json
      }
      admin_rekognition_shard_stats: { Args: never; Returns: Json }
      admin_remove_face_verification: {
        Args: { _user_id: string }
        Returns: Json
      }
      admin_remove_host_from_agency: {
        Args: { _host_id: string; _reason?: string }
        Returns: boolean
      }
      admin_remove_owner: {
        Args: { _admin_id: string; _target_email: string }
        Returns: Json
      }
      admin_reports_overview_stats: { Args: never; Returns: Json }
      admin_request_device_access: {
        Args: {
          _admin_id: string
          _device_fingerprint: string
          _device_info?: Json
          _device_name?: string
          _ip_address?: string
          _user_agent?: string
        }
        Returns: Json
      }
      admin_resolve_permanent_ban_targets: {
        Args: { _lookback_days?: number; _target_user_id: string }
        Returns: {
          relation_details: Json
          source: string
          user_id: string
        }[]
      }
      admin_revoke_device: {
        Args: { _device_id: string; _owner_admin_id: string; _reason?: string }
        Returns: Json
      }
      admin_rotate_secret_token: {
        Args: { _admin_id: string; _kind: string }
        Returns: Json
      }
      admin_send_notification: {
        Args: {
          _data?: Json
          _message: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      admin_session_block_user: {
        Args: {
          _admin_id: string
          _block: boolean
          _reason?: string
          _user_id: string
        }
        Returns: Json
      }
      admin_session_unban_live: {
        Args: { _admin_id: string; _ban_id: string; _reason?: string }
        Returns: Json
      }
      admin_set_host_status: {
        Args: { _make_host: boolean; _user_id: string }
        Returns: undefined
      }
      admin_toggle_face_verification: {
        Args: { _user_id: string; _verified: boolean }
        Returns: Json
      }
      admin_update_agency_level: {
        Args: { _agency_id: string; _level: number }
        Returns: Json
      }
      admin_update_face_violation: {
        Args: { _admin_id: string; _status: string; _violation_id: string }
        Returns: Json
      }
      admin_update_helper_application: {
        Args: {
          _admin_id: string
          _app_id: string
          _notes?: string
          _status: string
        }
        Returns: {
          country_code: string
          created_at: string | null
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          whatsapp_number: string
        }
        SetofOptions: {
          from: "*"
          to: "helper_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_update_my_support_display_name: {
        Args: { _name: string }
        Returns: string
      }
      admin_update_support_report: {
        Args: { _notes?: string; _report_id: string; _status: string }
        Returns: undefined
      }
      admin_update_user_gender: {
        Args: { _gender: string; _user_id: string }
        Returns: Json
      }
      admin_update_user_report: {
        Args: {
          _admin_id: string
          _admin_note?: string
          _report_id: string
          _status: string
        }
        Returns: {
          admin_notes: string | null
          created_at: string | null
          description: string | null
          evidence_urls: string[] | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        SetofOptions: {
          from: "*"
          to: "user_reports"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_agency_policy: {
        Args: {
          _admin_id: string
          _content: Json
          _display_order?: number
          _is_active?: boolean
          _section_key: string
          _section_title: string
        }
        Returns: {
          content: Json
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean | null
          section_key: string
          section_title: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agency_policy_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_upsert_party_background:
        | {
            Args: {
              _admin_id: string
              _category: string
              _display_order: number
              _gradient_css: string
              _id: string
              _image_url: string
              _is_active: boolean
              _is_premium: boolean
              _name: string
              _price_diamonds: number
            }
            Returns: {
              category: string | null
              created_at: string | null
              display_order: number | null
              gradient_css: string | null
              id: string
              image_url: string
              is_active: boolean | null
              is_free: boolean | null
              is_premium: boolean | null
              min_level: number
              name: string
              price_coins: number | null
              price_diamonds: number | null
              thumbnail_url: string | null
              updated_at: string | null
            }
            SetofOptions: {
              from: "*"
              to: "party_room_backgrounds"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              _admin_id: string
              _category: string
              _display_order: number
              _gradient_css: string
              _id: string
              _image_url: string
              _is_active: boolean
              _is_premium: boolean
              _min_level?: number
              _name: string
              _price_diamonds: number
            }
            Returns: {
              category: string | null
              created_at: string | null
              display_order: number | null
              gradient_css: string | null
              id: string
              image_url: string
              is_active: boolean | null
              is_free: boolean | null
              is_premium: boolean | null
              min_level: number
              name: string
              price_coins: number | null
              price_diamonds: number | null
              thumbnail_url: string | null
              updated_at: string | null
            }
            SetofOptions: {
              from: "*"
              to: "party_room_backgrounds"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      admin_user_stats: { Args: never; Returns: Json }
      admin_visual_assets_stats: { Args: never; Returns: Json }
      admin_withdrawal_stats: { Args: never; Returns: Json }
      agency_dashboard_charts: { Args: { p_agency_id: string }; Returns: Json }
      agency_dashboard_list_hosts: {
        Args: {
          p_agency_id: string
          p_limit?: number
          p_offset?: number
          p_search?: string
        }
        Returns: Json
      }
      agency_host_management_stats: {
        Args: { p_agency_id: string }
        Returns: Json
      }
      agency_send_diamonds_to_agency: {
        Args: {
          _amount: number
          _from_agency_id: string
          _to_agency_id: string
        }
        Returns: boolean
      }
      agency_send_diamonds_to_user: {
        Args: { _agency_id: string; _amount: number; _user_id: string }
        Returns: boolean
      }
      agency_weekly_total_income: {
        Args: { _agency_id: string }
        Returns: number
      }
      apply_as_topup_helper: { Args: { _data: Json }; Returns: Json }
      apply_install_referrer: {
        Args: {
          p_agency_code?: string
          p_invite_code?: string
          p_inviter_app_uid?: string
          p_user_id: string
        }
        Returns: Json
      }
      apply_multi_level_ban: {
        Args: {
          _ban_level: string
          _banned_by: string
          _reason: string
          _target_user_id: string
        }
        Returns: undefined
      }
      apply_vip_recharge_bonus: {
        Args: { _base_diamonds: number; _recharge_id: string; _user_id: string }
        Returns: Json
      }
      approve_agency_withdrawal: {
        Args: { _withdrawal_id: string }
        Returns: Json
      }
      approve_host_request:
        | {
            Args: { _agency_id: string; _approver_id: string; _host_id: string }
            Returns: boolean
          }
        | { Args: { p_request_id: string }; Returns: boolean }
      approve_rating_reward: {
        Args: { _admin_id: string; _reward_id: string }
        Returns: Json
      }
      assign_payroll_to_trader: {
        Args: { _withdrawal_id: string }
        Returns: Json
      }
      auto_distribute_leaderboard_rewards: { Args: never; Returns: string }
      auto_finalize_face_verification: {
        Args: {
          _action: string
          _approve_as?: string
          _reason?: string
          _set_gender?: string
          _submission_id: string
          _tags?: string[]
        }
        Returns: boolean
      }
      auto_process_live_game: { Args: never; Returns: undefined }
      ban_duplicate_face_attempt: {
        Args: { _face_hash: string; _matched_user_id: string; _user_id: string }
        Returns: undefined
      }
      ban_duplicate_face_user: {
        Args: {
          _confidence: number
          _original_user_id: string
          _rekognition_face_id: string
          _user_id: string
        }
        Returns: Json
      }
      bulk_credit_call_earnings: {
        Args: { _admin_id: string; _call_ids: string[] }
        Returns: Json
      }
      calculate_commission: {
        Args: { _amount: number; _rate: number }
        Returns: number
      }
      calculate_user_level: {
        Args: { _total_consumption: number }
        Returns: number
      }
      can_access_agency: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      can_access_party_room: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      can_initiate_private_call: {
        Args: {
          p_caller_id: string
          p_context_stream_id?: string
          p_host_id: string
        }
        Returns: Json
      }
      can_user_go_live: { Args: never; Returns: Json }
      cancel_account_deletion: { Args: { _user_id: string }; Returns: boolean }
      cancel_agency_request: { Args: { _host_id: string }; Returns: boolean }
      check_ban_on_login:
        | { Args: { _device_id?: string; _user_id: string }; Returns: Json }
        | {
            Args: {
              _device_id?: string
              _ip_address?: string
              _user_id: string
            }
            Returns: Json
          }
        | { Args: { p_user_id: string }; Returns: Json }
      check_brute_force: {
        Args: {
          p_action_type: string
          p_identifier: string
          p_ip_address?: string
        }
        Returns: Json
      }
      check_group_membership: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      check_otp_rate_limit: { Args: { p_email: string }; Returns: boolean }
      check_rate_limit: {
        Args: { _action: string; _max_per_hour?: number; _user_id: string }
        Returns: boolean
      }
      check_session_valid: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      check_signup_eligibility: {
        Args: { _device_id?: string; _face_hash?: string; _ip_address?: string }
        Returns: Json
      }
      check_user_anti_kick: {
        Args: { _moderator_user_id: string; _target_user_id: string }
        Returns: Json
      }
      check_user_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      claim_agency_withdrawal:
        | { Args: { _withdrawal_id: string }; Returns: Json }
        | {
            Args: {
              _helper_id: string
              _lock_seconds?: number
              _withdrawal_id: string
            }
            Returns: Json
          }
      claim_daily_login_reward: {
        Args: { _claimed_date: string; _day_end: string; _day_start: string }
        Returns: Json
      }
      claim_daily_task_reward: {
        Args: { _reset_date?: string; _task_id: string; _user_id: string }
        Returns: Json
      }
      claim_host_live_hour_bonus: {
        Args: { _host_id: string; _hour_number: number }
        Returns: Json
      }
      claim_invitation_reward: { Args: { _tier_id: string }; Returns: Json }
      claim_new_host_live_bonus: {
        Args: { _bonus_coins?: number; _host_id: string }
        Returns: Json
      }
      claim_parcel_reward: { Args: { p_parcel_id: string }; Returns: Json }
      claim_task_reward: {
        Args: { _task_date?: string; _task_id: string; _user_id: string }
        Returns: Json
      }
      claim_vip_daily_reward: { Args: never; Returns: Json }
      cleanup_application_logs: {
        Args: never
        Returns: {
          session_security_logs_deleted: number
          system_error_logs_deleted: number
        }[]
      }
      cleanup_expired_admin_sessions: { Args: never; Returns: undefined }
      cleanup_expired_otps: { Args: never; Returns: undefined }
      cleanup_expired_recordings: { Args: never; Returns: undefined }
      cleanup_expired_recovery_tokens: { Args: never; Returns: undefined }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_login_attempts: { Args: never; Returns: undefined }
      cleanup_old_security_alerts: { Args: never; Returns: undefined }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      cleanup_stale_data: { Args: never; Returns: undefined }
      cleanup_stale_in_call_flags: { Args: never; Returns: undefined }
      cleanup_stale_live_streams: { Args: never; Returns: number }
      cleanup_stale_online_users: { Args: never; Returns: undefined }
      cleanup_stale_party_participants: { Args: never; Returns: undefined }
      cleanup_stuck_calls: { Args: never; Returns: undefined }
      coin_trader_self_recharge: { Args: { amount: number }; Returns: Json }
      coin_trader_transfer_to_agency: {
        Args: { amount: number; target_agency_id: string }
        Returns: Json
      }
      coin_trader_transfer_to_user: {
        Args: { amount: number; recipient_uid: string }
        Returns: Json
      }
      complete_agency_withdrawal: {
        Args: { _proof: Json; _withdrawal_id: string }
        Returns: Json
      }
      create_agency_for_user: {
        Args: {
          _agency_code: string
          _commission_rate?: number
          _email?: string
          _level?: string
          _name: string
          _owner_id: string
          _whatsapp?: string
        }
        Returns: Json
      }
      create_agency_with_owner: {
        Args: {
          p_agency_code: string
          p_agency_name: string
          p_country?: string
          p_description?: string
          p_level?: string
          p_owner_phone?: string
          p_payment?: Json
        }
        Returns: Json
      }
      create_guest_profile: { Args: { _device_id: string }; Returns: Json }
      create_helper_order: {
        Args: {
          _amount_local: number
          _amount_usd: number
          _country_code?: string
          _currency_code?: string
          _package_id: string
          _payment_method: string
          _payment_proof?: string
        }
        Returns: Json
      }
      create_live_game_round: {
        Args: { _betting_time?: number; _game_type: string; _stream_id: string }
        Returns: string
      }
      create_notification: {
        Args: {
          _data?: Json
          _message: string
          _title: string
          _type?: string
          _user_id: string
        }
        Returns: string
      }
      create_party_room: {
        Args: {
          p_game_mode?: string
          p_name: string
          p_password?: string
          p_room_type: string
        }
        Returns: string
      }
      create_sub_agent: {
        Args: {
          _agency_id: string
          _commission_rate?: number
          _name: string
          _user_id: string
        }
        Returns: string
      }
      credit_sub_agent_commission: {
        Args: {
          _agency_id: string
          _host_earnings: number
          _host_id: string
          _source_id: string
          _source_type: string
        }
        Returns: undefined
      }
      current_admin_id: { Args: never; Returns: string }
      current_admin_id_from_header: { Args: never; Returns: string }
      current_admin_token_from_header: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      debug_distribute_test: {
        Args: { p_category: string; p_period_type: string }
        Returns: {
          detail: string
          step: string
        }[]
      }
      decline_host_request: { Args: { p_request_id: string }; Returns: boolean }
      decline_private_call: { Args: { _call_id: string }; Returns: boolean }
      deduct_agency_wallet: {
        Args: { p_agency_id: string; p_amount: number }
        Returns: Json
      }
      deduct_call_coins_per_minute: {
        Args: { p_call_id: string }
        Returns: Json
      }
      deduct_coins: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      deduct_coins_atomic:
        | { Args: { p_amount: number; p_user_id: string }; Returns: Json }
        | { Args: { p_amount: number; p_user_id: string }; Returns: Json }
        | {
            Args: { p_amount: number; p_reason?: string; p_user_id: string }
            Returns: Json
          }
      deduct_coins_from_user: {
        Args: { p_amount: number; p_user_id: string }
        Returns: boolean
      }
      deduct_helper_wallet:
        | { Args: { _amount: number; _helper_id: string }; Returns: Json }
        | {
            Args: {
              _amount: number
              _helper_id: string
              _update_total_sold?: boolean
            }
            Returns: Json
          }
      distribute_period_rewards: {
        Args: { p_category: string; p_period_type: string }
        Returns: number
      }
      distribute_pk_rewards: {
        Args: { p_competition_id: string }
        Returns: number
      }
      end_live_stream: { Args: { p_stream_id: string }; Returns: Json }
      end_party_room: { Args: { p_room_id: string }; Returns: Json }
      end_private_call: {
        Args: { _call_id: string; _end_reason?: string }
        Returns: boolean
      }
      ensure_profile_row_from_auth: {
        Args: { _email?: string; _raw_user_meta_data?: Json; _user_id: string }
        Returns: {
          active_device_id: string | null
          active_session_id: string | null
          age: number | null
          agency_id: string | null
          app_uid: string | null
          avatar_url: string | null
          beans: number | null
          beans_balance: number | null
          beauty_presets: Json | null
          bio: string | null
          birthday: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_rate_per_minute: number | null
          city: string | null
          coins: number | null
          country_code: string | null
          country_flag: string | null
          country_locked: boolean
          country_locked_at: string | null
          country_name: string | null
          cover_url: string | null
          created_at: string | null
          current_call_id: string | null
          current_vip_tier_id: string | null
          deletion_requested_at: string | null
          deletion_scheduled_at: string | null
          device_id: string | null
          diamonds: number | null
          display_name: string | null
          email: string | null
          email_notifications: boolean | null
          equipped_bubble_id: string | null
          equipped_entrance_id: string | null
          equipped_entry_banner_id: string | null
          equipped_entry_name_bar_id: string | null
          equipped_frame_id: string | null
          equipped_medal_id: string | null
          equipped_noble_card_id: string | null
          equipped_vehicle_id: string | null
          face_hash: string | null
          face_verification_image: string | null
          face_verification_status: string | null
          face_verified_at: string | null
          frame_id: string | null
          gender: string | null
          hide_location: boolean
          host_availability: string | null
          host_level: number | null
          host_photos: string[]
          host_status: string | null
          host_verified_at: string | null
          id: string
          incoming_call_sound: string | null
          is_agency_owner: boolean | null
          is_banned: boolean
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_face_verified: boolean | null
          is_host: boolean | null
          is_in_call: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          language: string | null
          last_active_at: string | null
          last_device_id: string | null
          last_login_at: string | null
          last_login_device: string | null
          last_login_device_info: Json | null
          last_login_ip: string | null
          last_seen: string
          last_seen_at: string | null
          max_user_level: number | null
          notification_vibrate: boolean | null
          pending_earnings: number | null
          phone_number: string | null
          phone_verified: boolean | null
          phone_violation_count: number | null
          previous_bubble_id: string | null
          previous_entrance_id: string | null
          previous_entry_banner_id: string | null
          previous_entry_name_bar_id: string | null
          previous_frame_id: string | null
          previous_host_level: number | null
          previous_medal_id: string | null
          previous_noble_card_id: string | null
          previous_vehicle_id: string | null
          profile_photo_url: string | null
          region: string | null
          registration_country_code: string | null
          registration_device_info: Json | null
          registration_ip: string | null
          registration_user_agent: string | null
          signup_country_code: string | null
          signup_country_flag: string | null
          signup_country_name: string | null
          signup_ip: string | null
          tags: string[] | null
          total_call_minutes: number | null
          total_calls_made: number | null
          total_calls_received: number | null
          total_consumption: number | null
          total_earnings: number | null
          total_recharged: number | null
          updated_at: string | null
          user_level: number | null
          username: string | null
          verification_type: string | null
          vip_expires_at: string | null
          vip_tier: number | null
          weekly_earnings: number | null
          weekly_reset_at: string | null
          who_can_call_me: string | null
          who_can_message_me: string | null
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      exchange_agency_beans_to_diamonds: {
        Args: {
          p_agency_id: string
          p_beans_to_deduct: number
          p_diamonds_to_add: number
          p_fee_amount: number
        }
        Returns: Json
      }
      exchange_user_beans_to_diamonds: {
        Args: {
          _beans_amount: number
          _diamonds_reward: number
          _tier_id?: string
          _user_id: string
        }
        Returns: Json
      }
      expire_noble_subscriptions: { Args: never; Returns: number }
      finalize_first_minute_earnings: {
        Args: { p_call_id: string }
        Returns: undefined
      }
      find_account_by_face: {
        Args: { face_hash_param: string }
        Returns: {
          avatar_url: string
          deletion_scheduled_at: string
          display_name: string
          is_deleted: boolean
          user_id: string
        }[]
      }
      find_available_helper: {
        Args: { user_country?: string }
        Returns: {
          country_code: string
          helper_id: string
          user_id: string
          wallet_balance: number
        }[]
      }
      fix_excess_weekly_rewards: {
        Args: never
        Returns: {
          category: string
          excess_beans: number
          excess_diamonds: number
          records_deleted: number
          user_id: string
        }[]
      }
      game_cashout: {
        Args: {
          p_bet_id: string
          p_multiplier: number
          p_user_id: string
          p_win_amount: number
        }
        Returns: Json
      }
      generate_admin_access_token: {
        Args: {
          _label: string
          _role?: Database["public"]["Enums"]["admin_role"]
        }
        Returns: string
      }
      generate_app_uid: { Args: never; Returns: string }
      generate_game_token: {
        Args: {
          p_game_id?: string
          p_merchant_id?: string
          p_room_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      generate_sub_agent_referral_code: {
        Args: { _agency_id: string }
        Returns: string
      }
      generate_unique_app_uid: { Args: never; Returns: string }
      generate_user_parcels: { Args: { p_user_id: string }; Returns: undefined }
      get_accessible_sections: {
        Args: { _user_id: string }
        Returns: {
          can_edit: boolean
          hub_key: string
          section_key: string
          section_name: string
        }[]
      }
      get_account_by_device_id: {
        Args: { p_device_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          gender: string
          is_host: boolean
          user_id: string
        }[]
      }
      get_active_beauty_assets: { Args: never; Returns: Json }
      get_admin_analytics_chart_data: {
        Args: { p_days?: number }
        Returns: Json
      }
      get_admin_by_session_token: {
        Args: { _token: string }
        Returns: {
          admin_id: string
          email: string
          is_active: boolean
          role: Database["public"]["Enums"]["admin_role"]
        }[]
      }
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_admin_role: { Args: { _user_id: string }; Returns: string }
      get_agency_by_code: {
        Args: { agency_code: string }
        Returns: {
          id: string
          level: string
          name: string
          total_hosts: number
        }[]
      }
      get_agency_diamond_balance: {
        Args: { owner_user_id: string }
        Returns: number
      }
      get_agency_numeric_level: {
        Args: { _agency_id: string }
        Returns: number
      }
      get_agency_rankings: {
        Args: { _limit?: number; _period_type: string; _ranking_type: string }
        Returns: {
          agency_code: string
          agency_id: string
          agency_name: string
          country_code: string
          country_flag: string
          metric_value: number
          owner_avatar: string
          rank_position: number
          total_hosts: number
        }[]
      }
      get_agency_transfer_history: {
        Args: { _agency_id: string; _limit?: number; _offset?: number }
        Returns: {
          amount: number
          call_earnings: number
          commission_rate: number
          created_at: string
          gift_earnings: number
          host_id: string
          host_name: string
          host_uid: string
          id: string
          period_end: string
          period_start: string
          status: string
          transfer_type: string
        }[]
      }
      get_conversations_with_details: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_daily_task_progress: {
        Args: { _reset_date: string; _user_id: string }
        Returns: {
          current_progress: number
          is_claimed: boolean
          is_completed: boolean
          task_id: string
        }[]
      }
      get_effective_host_percent: { Args: never; Returns: number }
      get_effective_user_receiver_percent: { Args: never; Returns: number }
      get_game_rankings_leaderboard: {
        Args: { p_period_type?: string }
        Returns: {
          app_uid: string
          avatar_url: string
          country_flag: string
          display_name: string
          frame_id: string
          host_level: number
          id: string
          stat_value: number
          user_level: number
        }[]
      }
      get_host_agency_request: {
        Args: { _host_id: string }
        Returns: {
          agency_code: string
          agency_id: string
          agency_logo: string
          agency_name: string
          host_id: string
          id: string
          joined_at: string
          status: string
        }[]
      }
      get_host_earnings_leaderboard: {
        Args: { p_period_type?: string }
        Returns: {
          app_uid: string
          avatar_url: string
          country_flag: string
          display_name: string
          frame_id: string
          host_level: number
          id: string
          stat_value: number
          user_level: number
        }[]
      }
      get_host_live_bonus_state: { Args: { _host_id: string }; Returns: Json }
      get_leaderboard: {
        Args: { _period: string }
        Returns: {
          avatar_url: string
          country_flag: string
          display_name: string
          level: number
          rank: number
          stat_value: number
          user_id: string
        }[]
      }
      get_next_available_shard: { Args: never; Returns: string }
      get_noble_subscriptions_needing_reminder: {
        Args: never
        Returns: {
          days_remaining: number
          expires_at: string
          rank_name: string
          reminder_type: string
          subscription_id: string
          user_id: string
        }[]
      }
      get_public_home_hosts_v1: {
        Args: {
          p_current_user_id?: string
          p_selected_country?: string
          p_sub_tab?: string
        }
        Returns: {
          avatar_url: string
          bio: string
          call_rate_per_minute: number
          country_code: string
          country_flag: string
          created_at: string
          display_name: string
          frame_id: string
          gender: string
          host_availability: string
          host_level: number
          host_status: string
          id: string
          is_face_verified: boolean
          is_host: boolean
          is_in_call: boolean
          is_online: boolean
          is_verified: boolean
          last_seen_at: string
          user_level: number
          username: string
        }[]
      }
      get_public_host_countries_v1: {
        Args: never
        Returns: {
          country_code: string
          country_flag: string
        }[]
      }
      get_rate_for_numeric_level: { Args: { _level: number }; Returns: number }
      get_task_center_calendar: { Args: never; Returns: Json }
      get_task_program_day: { Args: { _host_id: string }; Returns: number }
      get_task_reset_date: { Args: never; Returns: string }
      get_task_week_reset_date: { Args: never; Returns: string }
      get_top_gifters_leaderboard: {
        Args: { p_period_type?: string }
        Returns: {
          app_uid: string
          avatar_url: string
          country_flag: string
          display_name: string
          frame_id: string
          host_level: number
          id: string
          stat_value: number
          user_level: number
        }[]
      }
      get_transfer_wallet_sources: {
        Args: { _user_id: string }
        Returns: {
          agency_diamond_balance: number
          agency_id: string
          helper_id: string
          helper_wallet_balance: number
          personal_coins: number
        }[]
      }
      get_user_active_noble: {
        Args: { _user_id: string }
        Returns: {
          badge_url: string
          crown_url: string
          days_remaining: number
          entrance_animation_url: string
          expires_at: string
          noble_card_id: string
          rank_code: string
          rank_name: string
          rank_order: number
          subscription_id: string
        }[]
      }
      get_user_balance: { Args: { _user_id: string }; Returns: Json }
      get_user_live_ban: {
        Args: { p_user_id: string }
        Returns: {
          ban_end: string
          ban_id: string
          ban_reason: string
          ban_start: string
          banned_by: string
        }[]
      }
      get_user_notices: {
        Args: { p_user_id: string }
        Returns: {
          created_at: string
          id: string
          image_url: string
          is_read: boolean
          message: string
          priority: string
          title: string
        }[]
      }
      handle_game_callback: {
        Args: {
          p_action: string
          p_amount?: number
          p_details?: Json
          p_game_id?: string
          p_round_id?: string
          p_token: string
        }
        Returns: Json
      }
      has_role: { Args: { _role: string; _user_id: string }; Returns: boolean }
      has_unclaimed_task_reward: { Args: { uid: string }; Returns: boolean }
      hash_admin_pin: { Args: { _pin: string }; Returns: string }
      helper_add_coins_to_user: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      helper_add_diamonds_to_agency: {
        Args: { _agency_id: string; _amount: number }
        Returns: Json
      }
      helper_process_agency_withdrawal: {
        Args: {
          _helper_id: string
          _screenshot_url: string
          _transaction_note?: string
          _withdrawal_id: string
        }
        Returns: Json
      }
      helper_transfer_coins_to_user: {
        Args: {
          _amount: number
          _receiver_id: string
          _sender_id: string
          _sender_type?: string
        }
        Returns: Json
      }
      helper_transfer_diamonds_to_agency: {
        Args: {
          _amount: number
          _sender_id: string
          _sender_type?: string
          _target_agency_id: string
        }
        Returns: Json
      }
      helper_transfer_diamonds_to_self: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      host_weekly_contribution: { Args: { _uid?: string }; Returns: number }
      increment_reel_view: { Args: { reel_uuid: string }; Returns: undefined }
      is_active_admin_owner_session: { Args: never; Returns: boolean }
      is_active_admin_session: { Args: never; Returns: boolean }
      is_active_owner_session: { Args: never; Returns: boolean }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin_device_approved: {
        Args: { _device_fingerprint: string; _user_id: string }
        Returns: boolean
      }
      is_admin_request: { Args: never; Returns: boolean }
      is_admin_session: { Args: { _admin_id: string }; Returns: boolean }
      is_admin_v2: { Args: { _user_id: string }; Returns: boolean }
      is_agency_owner: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_caller_admin: { Args: never; Returns: boolean }
      is_caller_owner: { Args: never; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_own_profile: { Args: { _profile_id: string }; Returns: boolean }
      is_owner: { Args: { _user_id: string }; Returns: boolean }
      is_owner_email: { Args: { _email: string }; Returns: boolean }
      is_real_user: { Args: never; Returns: boolean }
      is_user_live_banned: { Args: { p_user_id: string }; Returns: boolean }
      join_agency: {
        Args: { _agency_code: string; _host_id: string; _joined_via?: string }
        Returns: boolean
      }
      leave_agency: { Args: never; Returns: Json }
      log_admin_action: {
        Args: {
          _action_type: string
          _details?: Json
          _target_id?: string
          _target_type?: string
        }
        Returns: undefined
      }
      mark_call_delivered: {
        Args: { p_call_id: string; p_channel?: string; p_device_info?: Json }
        Returns: Json
      }
      mark_live_stream_live: { Args: { p_stream_id: string }; Returns: Json }
      mark_messages_delivered: {
        Args: { p_conversation_id: string; p_recipient_id: string }
        Returns: number
      }
      mark_noble_reminder_sent: {
        Args: { _reminder_type: string; _subscription_id: string }
        Returns: undefined
      }
      moderate_text: {
        Args: { p_context?: string; p_text: string }
        Returns: Json
      }
      place_game_bet:
        | {
            Args: { p_amount: number; p_game_type?: string; p_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_game_id: string
              p_game_name: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_bet_amount: number
              p_game_type: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_bet_amount: number
              p_game_type: string
              p_user_id: string
            }
            Returns: Json
          }
      place_live_game_bet: {
        Args: {
          p_bet_amount: number
          p_bet_type?: string
          p_bet_value?: string
          p_round_id: string
          p_user_id: string
        }
        Returns: Json
      }
      process_contact_violation: {
        Args: {
          p_detected_content: string
          p_detected_pattern: string
          p_host_id: string
          p_source_id?: string
          p_source_type: string
        }
        Returns: Json
      }
      process_face_verification_v3: {
        Args: {
          p_confidence: number
          p_duplicate_user_id?: string
          p_face_rekognition_id: string
          p_is_match: boolean
          p_live_face_url?: string
          p_profile_photo_url: string
          p_user_id: string
        }
        Returns: Json
      }
      process_game_bet: {
        Args: {
          p_bet_amount: number
          p_bet_type?: string
          p_bet_value?: string
          p_game_id: string
          p_user_id: string
        }
        Returns: Json
      }
      process_game_win:
        | {
            Args: {
              p_amount: number
              p_game_id: string
              p_game_name: string
              p_is_jackpot?: boolean
              p_multiplier?: number
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: { p_amount: number; p_game_type?: string; p_user_id: string }
            Returns: Json
          }
        | {
            Args: {
              p_amount: number
              p_game_id: string
              p_game_name: string
              p_is_jackpot?: boolean
              p_multiplier?: number
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_game_type: string
              p_user_id: string
              p_win_amount: number
            }
            Returns: Json
          }
      process_gift_transaction:
        | {
            Args: {
              p_call_id?: string
              p_gift_id: string
              p_party_room_id?: string
              p_quantity?: number
              p_receiver_id: string
              p_sender_id: string
              p_stream_id?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_call_id?: string
              p_gift_id: string
              p_party_room_id?: string
              p_quantity?: number
              p_receiver_id: string
              p_reel_id?: string
              p_sender_id: string
              p_stream_id?: string
            }
            Returns: Json
          }
      process_live_game_round: {
        Args: { p_result?: string; p_round_id: string; p_winning_value: string }
        Returns: Json
      }
      process_user_beans_exchange: { Args: { p_amount: number }; Returns: Json }
      process_vip_subscription: {
        Args: { p_billing?: string; p_equip_updates?: Json; p_plan_id: string }
        Returns: Json
      }
      process_weekly_agency_transfers: { Args: never; Returns: Json }
      profile_follow_stats: { Args: { uid: string }; Returns: Json }
      purchase_noble_card: {
        Args: { _auto_renew?: boolean; _noble_card_id: string }
        Returns: Json
      }
      purchase_shop_item: {
        Args: {
          p_duration_days?: number
          p_item_id: string
          p_item_type: string
        }
        Returns: Json
      }
      purchase_vip_tier: {
        Args: {
          p_duration_days: number
          p_equip_updates?: Json
          p_price_diamonds: number
          p_tier_id: string
          p_tier_level: number
          p_user_id: string
        }
        Returns: Json
      }
      raise_security_alert: {
        Args: {
          p_alert_type: string
          p_description: string
          p_device_info?: Json
          p_ip_address?: string
          p_metadata?: Json
          p_severity: string
        }
        Returns: Json
      }
      recalculate_all_agency_levels: { Args: never; Returns: Json }
      recalculate_all_user_levels: { Args: never; Returns: undefined }
      recalculate_single_user_level: {
        Args: { _user_id: string }
        Returns: undefined
      }
      recalculate_user_level: { Args: { _user_id: string }; Returns: undefined }
      record_host_live_minute: { Args: { _host_id: string }; Returns: Json }
      record_live_violation: {
        Args: {
          p_auto_detected?: boolean
          p_stream_id: string
          p_user_id: string
          p_violation_type: string
        }
        Returns: undefined
      }
      record_login_attempt: {
        Args: {
          p_identifier: string
          p_ip_address?: string
          p_success: boolean
          p_user_agent?: string
        }
        Returns: undefined
      }
      recover_session_by_device: {
        Args: { p_device_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          gender: string
          is_host: boolean
          recovery_email: string
          recovery_password: string
          user_id: string
        }[]
      }
      regenerate_admin_secret_token: {
        Args: { _new_token: string }
        Returns: Json
      }
      register_admin_device: {
        Args: {
          _device_fingerprint: string
          _device_info?: Json
          _device_name?: string
          _ip_address?: string
          _user_agent?: string
        }
        Returns: undefined
      }
      reject_host_request: {
        Args: { _agency_id: string; _host_id: string; _rejector_id: string }
        Returns: Json
      }
      release_agency_withdrawal_claim: {
        Args: { _helper_id: string; _withdrawal_id: string }
        Returns: Json
      }
      release_expired_withdrawal_locks: { Args: never; Returns: undefined }
      report_live_face_event: {
        Args: {
          p_device_info?: Json
          p_duration_seconds: number
          p_event: string
          p_session_type: string
          p_stream_id: string
        }
        Returns: string
      }
      request_account_deletion: {
        Args: { user_id_param: string }
        Returns: undefined
      }
      request_agency_withdrawal: {
        Args: {
          p_agency_id: string
          p_amount: number
          p_notes?: string
          p_payment_details?: Json
          p_payment_method?: string
        }
        Returns: Json
      }
      reset_host_weekly_policy_after_withdrawal: {
        Args: { p_host_id: string }
        Returns: Json
      }
      reset_host_weekly_state_on_withdrawal: {
        Args: { _agency_id: string }
        Returns: undefined
      }
      reset_my_call_status: { Args: never; Returns: undefined }
      resolve_agency_commission_rate: {
        Args: { _agency_id: string }
        Returns: number
      }
      rewrite_helper_payment_logo_urls: { Args: never; Returns: number }
      roulette_complete_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      roulette_get_or_create_session: {
        Args: { p_duration_seconds?: number }
        Returns: Json
      }
      roulette_spin_wheel: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      safe_credit_diamonds: {
        Args: {
          p_amount: number
          p_amount_usd?: number
          p_gateway?: string
          p_metadata?: Json
          p_order_id?: string
          p_transaction_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      search_group_by_code: {
        Args: { _code: string }
        Returns: {
          avatar_url: string
          group_code: string
          id: string
          is_public: boolean
          member_count: number
          name: string
        }[]
      }
      search_user_by_app_uid: {
        Args: { _app_uid: string }
        Returns: {
          app_uid: string
          avatar_url: string
          display_name: string
          id: string
          is_host: boolean
          is_online: boolean
          user_level: number
        }[]
      }
      search_user_by_id: {
        Args: { _search_id: string }
        Returns: {
          app_uid: string
          avatar_url: string
          display_name: string
          id: string
          is_host: boolean
          is_online: boolean
          user_level: number
        }[]
      }
      secure_play_native_game: {
        Args: { p_bet_amount: number; p_game_id: string }
        Returns: Json
      }
      send_notification: {
        Args: {
          p_data?: Json
          p_message?: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: undefined
      }
      service_auto_finalize_face_verification: {
        Args: { p_submission_id: string }
        Returns: Json
      }
      set_signup_country: {
        Args: {
          _city?: string
          _country_code: string
          _country_flag: string
          _country_name: string
          _ip?: string
          _region?: string
        }
        Returns: Json
      }
      set_user_offline: { Args: { p_user_id: string }; Returns: undefined }
      settle_private_call: { Args: { p_call_id: string }; Returns: Json }
      start_live_stream: {
        Args: {
          p_category_id?: string
          p_display_name?: string
          p_live_privacy?: string
          p_password?: string
          p_thumbnail_url?: string
          p_title?: string
        }
        Returns: Json
      }
      start_private_call: {
        Args: {
          p_call_type?: string
          p_caller_id: string
          p_context_stream_id?: string
          p_receiver_id: string
        }
        Returns: Json
      }
      support_admin_file_report: {
        Args: { _message_id: string; _reason: string; _ticket_id: string }
        Returns: string
      }
      timeout_private_call: { Args: { _call_id: string }; Returns: Json }
      transfer_coins_to_user: {
        Args: {
          _amount: number
          _note?: string
          _receiver_id: string
          _sender_id: string
        }
        Returns: boolean
      }
      trigger_weekly_agency_schedule: { Args: never; Returns: Json }
      update_active_session: {
        Args: { _device_info?: Json; _session_id: string }
        Returns: undefined
      }
      update_admin_device_status: {
        Args: { _device_id: string; _new_status: string; _notes?: string }
        Returns: undefined
      }
      update_avatar: { Args: { p_public_url: string }; Returns: Json }
      update_host_call_rate: { Args: { p_rate: number }; Returns: Json }
      update_host_earnings_only: {
        Args: {
          p_beans_to_add: number
          p_host_id: string
          p_new_host_level: number
          p_new_total_earnings: number
        }
        Returns: undefined
      }
      update_online_status: {
        Args: {
          p_is_online: boolean
          p_last_seen_at?: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_profile: { Args: { p_patch: Json }; Returns: Json }
      update_stream_heartbeat: {
        Args: { _stream_id: string }
        Returns: undefined
      }
      update_task_progress:
        | { Args: { _task_key: string }; Returns: Json }
        | {
            Args: { _increment?: number; _task_type: string; _value?: number }
            Returns: Json
          }
      update_user_beauty_presets: { Args: { _presets: Json }; Returns: boolean }
      validate_admin_access_token: { Args: { _token: string }; Returns: Json }
      validate_session_integrity: {
        Args: {
          p_device_fingerprint: string
          p_ip_address: string
          p_user_agent: string
          p_user_id: string
        }
        Returns: Json
      }
      validate_user_task_progress_claim: {
        Args: { _task_id: string; _user_id: string }
        Returns: Json
      }
      verify_party_room_password: {
        Args: { _password: string; _room_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admin_device_status:
        | "pending"
        | "approved"
        | "blocked"
        | "rejected"
        | "revoked"
      admin_role: "owner" | "sub_admin"
      app_role: "admin" | "moderator" | "user"
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
      admin_device_status: [
        "pending",
        "approved",
        "blocked",
        "rejected",
        "revoked",
      ],
      admin_role: ["owner", "sub_admin"],
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
