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
    PostgrestVersion: "14.4"
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
          {
            foreignKeyName: "admin_allowed_devices_approved_by_fkey"
            columns: ["approved_by"]
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
        Relationships: [
          {
            foreignKeyName: "admin_section_permissions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_section_permissions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "admin_sections"
            referencedColumns: ["id"]
          },
        ]
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
      admin_users: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          display_name: string | null
          email: string
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          last_login_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          last_login_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
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
          total_agents?: number | null
          total_hosts?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agencies_parent_agency_id_fkey"
            columns: ["parent_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agencies_parent_agency_id_fkey"
            columns: ["parent_agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
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
          {
            foreignKeyName: "agency_commission_history_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_commission_history_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          {
            foreignKeyName: "agency_diamond_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_diamond_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_hosts_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: true
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
      agency_withdrawals: {
        Row: {
          agency_id: string
          amount: number
          assigned_helper_id: string | null
          country_code: string | null
          currency_code: string | null
          diamond_reward: number | null
          helper_net_reward: number | null
          helper_notes: string | null
          helper_payment_screenshot: string | null
          helper_processed_at: string | null
          helper_transaction_id: string | null
          id: string
          local_currency_amount: number | null
          notes: string | null
          payment_details: Json | null
          payment_method: string | null
          platform_fee_amount: number | null
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: string
        }
        Insert: {
          agency_id: string
          amount: number
          assigned_helper_id?: string | null
          country_code?: string | null
          currency_code?: string | null
          diamond_reward?: number | null
          helper_net_reward?: number | null
          helper_notes?: string | null
          helper_payment_screenshot?: string | null
          helper_processed_at?: string | null
          helper_transaction_id?: string | null
          id?: string
          local_currency_amount?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          platform_fee_amount?: number | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          agency_id?: string
          amount?: number
          assigned_helper_id?: string | null
          country_code?: string | null
          currency_code?: string | null
          diamond_reward?: number | null
          helper_net_reward?: number | null
          helper_notes?: string | null
          helper_payment_screenshot?: string | null
          helper_processed_at?: string | null
          helper_transaction_id?: string | null
          id?: string
          local_currency_amount?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          platform_fee_amount?: number | null
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: string
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
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      allowed_external_links: {
        Row: {
          added_by: string | null
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          link_type: string
          updated_at: string
          url_pattern: string
        }
        Insert: {
          added_by?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          link_type?: string
          updated_at?: string
          url_pattern: string
        }
        Update: {
          added_by?: string | null
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          link_type?: string
          updated_at?: string
          url_pattern?: string
        }
        Relationships: []
      }
      app_content: {
        Row: {
          content: string
          id: string
          is_active: boolean | null
          page_key: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content: string
          id?: string
          is_active?: boolean | null
          page_key: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          is_active?: boolean | null
          page_key?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_event_themes: {
        Row: {
          accent_color: string
          auto_schedule: boolean
          card_border_color: string
          card_decoration_style: string | null
          country_code: string | null
          created_at: string
          description: string | null
          display_order: number | null
          ends_at: string | null
          floating_particles: string[] | null
          header_gradient_from: string
          header_gradient_to: string
          id: string
          is_active: boolean
          nav_active_color: string
          nav_bg_color: string
          nav_decoration_style: string | null
          nav_home_icon_url: string | null
          nav_party_icon_url: string | null
          nav_profile_icon_url: string | null
          nav_reels_icon_url: string | null
          primary_color: string
          secondary_color: string
          starts_at: string | null
          tab_active_color: string
          tab_decoration_style: string | null
          theme_icon: string
          theme_key: string
          theme_name: string
          updated_at: string
        }
        Insert: {
          accent_color?: string
          auto_schedule?: boolean
          card_border_color?: string
          card_decoration_style?: string | null
          country_code?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          floating_particles?: string[] | null
          header_gradient_from?: string
          header_gradient_to?: string
          id?: string
          is_active?: boolean
          nav_active_color?: string
          nav_bg_color?: string
          nav_decoration_style?: string | null
          nav_home_icon_url?: string | null
          nav_party_icon_url?: string | null
          nav_profile_icon_url?: string | null
          nav_reels_icon_url?: string | null
          primary_color?: string
          secondary_color?: string
          starts_at?: string | null
          tab_active_color?: string
          tab_decoration_style?: string | null
          theme_icon?: string
          theme_key: string
          theme_name: string
          updated_at?: string
        }
        Update: {
          accent_color?: string
          auto_schedule?: boolean
          card_border_color?: string
          card_decoration_style?: string | null
          country_code?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          ends_at?: string | null
          floating_particles?: string[] | null
          header_gradient_from?: string
          header_gradient_to?: string
          id?: string
          is_active?: boolean
          nav_active_color?: string
          nav_bg_color?: string
          nav_decoration_style?: string | null
          nav_home_icon_url?: string | null
          nav_party_icon_url?: string | null
          nav_profile_icon_url?: string | null
          nav_reels_icon_url?: string | null
          primary_color?: string
          secondary_color?: string
          starts_at?: string | null
          tab_active_color?: string
          tab_decoration_style?: string | null
          theme_icon?: string
          theme_key?: string
          theme_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_icon_registry: {
        Row: {
          animation_url: string | null
          category: string
          color_hex: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          fallback_emoji: string | null
          icon_key: string
          icon_name: string
          icon_type: string
          icon_url: string | null
          id: string
          is_active: boolean | null
          lucide_name: string | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          category?: string
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          fallback_emoji?: string | null
          icon_key: string
          icon_name: string
          icon_type?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          lucide_name?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          category?: string
          color_hex?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          fallback_emoji?: string | null
          icon_key?: string
          icon_name?: string
          icon_type?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          lucide_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      app_version_settings: {
        Row: {
          created_at: string
          current_version_code: number
          current_version_name: string
          force_update: boolean | null
          id: string
          min_version_code: number
          platform: string
          play_store_url: string | null
          update_message: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_version_code?: number
          current_version_name?: string
          force_update?: boolean | null
          id?: string
          min_version_code?: number
          platform?: string
          play_store_url?: string | null
          update_message?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_version_code?: number
          current_version_name?: string
          force_update?: boolean | null
          id?: string
          min_version_code?: number
          platform?: string
          play_store_url?: string | null
          update_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ar_stickers: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          is_active: boolean
          is_free: boolean
          is_premium: boolean
          min_level: number | null
          name: string
          preview_image_url: string | null
          price_diamonds: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number | null
          file_type?: string
          file_url: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_premium?: boolean
          min_level?: number | null
          name: string
          preview_image_url?: string | null
          price_diamonds?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_premium?: boolean
          min_level?: number | null
          name?: string
          preview_image_url?: string | null
          price_diamonds?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      avatar_frames: {
        Row: {
          animation_type: string | null
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          frame_type: string | null
          frame_url: string
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          target_type: string | null
          updated_at: string | null
        }
        Insert: {
          animation_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          frame_type?: string | null
          frame_url: string
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number | null
          target_type?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_type?: string | null
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          frame_type?: string | null
          frame_url?: string
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number | null
          target_type?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      banned_devices: {
        Row: {
          banned_at: string | null
          banned_by: string | null
          device_id: string
          id: string
          is_permanent: boolean | null
          reason: string | null
          user_id: string | null
        }
        Insert: {
          banned_at?: string | null
          banned_by?: string | null
          device_id: string
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          banned_at?: string | null
          banned_by?: string | null
          device_id?: string
          id?: string
          is_permanent?: boolean | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banned_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "banned_devices_user_id_fkey"
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
          created_at: string
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_type: string | null
          link_url: string | null
          start_date: string | null
          subtitle: string | null
          text_color: string | null
          title: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          background_color?: string | null
          created_at?: string
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          start_date?: string | null
          subtitle?: string | null
          text_color?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          background_color?: string | null
          created_at?: string
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          start_date?: string | null
          subtitle?: string | null
          text_color?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      beauty_filters: {
        Row: {
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          file_size_bytes: number | null
          file_type: string
          file_url: string
          id: string
          is_active: boolean
          is_free: boolean
          is_premium: boolean
          min_level: number | null
          name: string
          preview_image_url: string | null
          price_diamonds: number | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number | null
          file_type?: string
          file_url: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_premium?: boolean
          min_level?: number | null
          name: string
          preview_image_url?: string | null
          price_diamonds?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          file_size_bytes?: number | null
          file_type?: string
          file_url?: string
          id?: string
          is_active?: boolean
          is_free?: boolean
          is_premium?: boolean
          min_level?: number | null
          name?: string
          preview_image_url?: string | null
          price_diamonds?: number | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      blocked_ips: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          expires_at: string | null
          id: string
          ip_address: unknown
          is_permanent: boolean | null
          reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: unknown
          is_permanent?: boolean | null
          reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: unknown
          is_permanent?: boolean | null
          reason?: string | null
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          background_type: string | null
          background_url: string | null
          created_at: string | null
          id: string
          logo_image_url: string | null
          logo_text_primary: string | null
          logo_text_secondary: string | null
          tagline: string | null
          updated_at: string | null
        }
        Insert: {
          background_type?: string | null
          background_url?: string | null
          created_at?: string | null
          id?: string
          logo_image_url?: string | null
          logo_text_primary?: string | null
          logo_text_secondary?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Update: {
          background_type?: string | null
          background_url?: string | null
          created_at?: string | null
          id?: string
          logo_image_url?: string | null
          logo_text_primary?: string | null
          logo_text_secondary?: string | null
          tagline?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      call_events: {
        Row: {
          call_id: string
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
        }
        Insert: {
          call_id: string
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
        }
        Update: {
          call_id?: string
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_events_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "private_calls"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      channels: {
        Row: {
          category: string
          country: string
          country_code: string
          created_at: string
          description: string | null
          display_order: number | null
          fallback_type: string | null
          fallback_url: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_live: boolean | null
          is_premium: boolean | null
          logo_url: string | null
          name: string
          slug: string
          stream_type: string | null
          stream_url: string | null
          updated_at: string
          viewer_count: number | null
        }
        Insert: {
          category?: string
          country?: string
          country_code?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          fallback_type?: string | null
          fallback_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_live?: boolean | null
          is_premium?: boolean | null
          logo_url?: string | null
          name: string
          slug: string
          stream_type?: string | null
          stream_url?: string | null
          updated_at?: string
          viewer_count?: number | null
        }
        Update: {
          category?: string
          country?: string
          country_code?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          fallback_type?: string | null
          fallback_url?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_live?: boolean | null
          is_premium?: boolean | null
          logo_url?: string | null
          name?: string
          slug?: string
          stream_type?: string | null
          stream_url?: string | null
          updated_at?: string
          viewer_count?: number | null
        }
        Relationships: []
      }
      chat_moderation_logs: {
        Row: {
          action_taken: string | null
          conversation_id: string | null
          created_at: string
          detected_content: string | null
          group_id: string | null
          id: string
          is_auto_action: boolean | null
          message_id: string | null
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          user_id: string
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          conversation_id?: string | null
          created_at?: string
          detected_content?: string | null
          group_id?: string | null
          id?: string
          is_auto_action?: boolean | null
          message_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id: string
          violation_type?: string
        }
        Update: {
          action_taken?: string | null
          conversation_id?: string | null
          created_at?: string
          detected_content?: string | null
          group_id?: string | null
          id?: string
          is_auto_action?: boolean | null
          message_id?: string | null
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          user_id?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_moderation_logs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_moderation_logs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_moderation_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_moderation_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      coin_packages: {
        Row: {
          base_coins: number
          bonus_percentage: number | null
          coins: number
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          is_best_value: boolean | null
          is_popular: boolean | null
          price_usd: number
          updated_at: string | null
        }
        Insert: {
          base_coins?: number
          bonus_percentage?: number | null
          coins: number
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_best_value?: boolean | null
          is_popular?: boolean | null
          price_usd: number
          updated_at?: string | null
        }
        Update: {
          base_coins?: number
          bonus_percentage?: number | null
          coins?: number
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          is_best_value?: boolean | null
          is_popular?: boolean | null
          price_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      coin_transfers: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          receiver_id: string
          sender_id: string
          sender_type: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          receiver_id: string
          sender_id: string
          sender_type?: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          receiver_id?: string
          sender_id?: string
          sender_type?: string
          status?: string
        }
        Relationships: []
      }
      consumption_return_config: {
        Row: {
          created_at: string
          display_order: number | null
          id: string
          is_active: boolean
          max_return_coins: number | null
          max_spend: number | null
          min_spend: number
          period_type: string
          return_percentage: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          max_return_coins?: number | null
          max_spend?: number | null
          min_spend?: number
          period_type?: string
          return_percentage?: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number | null
          id?: string
          is_active?: boolean
          max_return_coins?: number | null
          max_spend?: number | null
          min_spend?: number
          period_type?: string
          return_percentage?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      consumption_return_history: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: string
          is_claimed: boolean
          period_label: string
          period_type: string
          return_coins: number
          return_percentage: number
          tier_name: string
          total_spent: number
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          period_label: string
          period_type: string
          return_coins: number
          return_percentage: number
          tier_name: string
          total_spent?: number
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          is_claimed?: boolean
          period_label?: string
          period_type?: string
          return_coins?: number
          return_percentage?: number
          tier_name?: string
          total_spent?: number
          user_id?: string
        }
        Relationships: []
      }
      content_audio_tracks: {
        Row: {
          audio_url: string
          content_id: string
          created_at: string | null
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_original: boolean | null
          language_code: string
          language_name: string
          quality: string | null
          updated_at: string | null
        }
        Insert: {
          audio_url: string
          content_id: string
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_original?: boolean | null
          language_code: string
          language_name: string
          quality?: string | null
          updated_at?: string | null
        }
        Update: {
          audio_url?: string
          content_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_original?: boolean | null
          language_code?: string
          language_name?: string
          quality?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_audio_tracks_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "site_content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_subtitles: {
        Row: {
          content_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          is_auto_generated: boolean | null
          language_code: string
          language_name: string
          subtitle_text: string | null
          subtitle_url: string | null
          updated_at: string | null
        }
        Insert: {
          content_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          language_code: string
          language_name: string
          subtitle_text?: string | null
          subtitle_url?: string | null
          updated_at?: string | null
        }
        Update: {
          content_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_auto_generated?: boolean | null
          language_code?: string
          language_name?: string
          subtitle_text?: string | null
          subtitle_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_subtitles_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "site_content"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_encryption_keys: {
        Row: {
          conversation_id: string
          created_at: string
          encrypted_key: string
          id: string
          key_version: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          encrypted_key: string
          id?: string
          key_version?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          encrypted_key?: string
          id?: string
          key_version?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          participant_1: string
          participant_2: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          participant_1: string
          participant_2: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          participant_1?: string
          participant_2?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_participant_1_fkey"
            columns: ["participant_1"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_1_fkey"
            columns: ["participant_1"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_2_fkey"
            columns: ["participant_2"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_participant_2_fkey"
            columns: ["participant_2"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rates: {
        Row: {
          country_code: string
          currency_code: string
          currency_symbol: string
          id: string
          is_active: boolean | null
          rate_to_usd: number
          updated_at: string | null
        }
        Insert: {
          country_code: string
          currency_code: string
          currency_symbol: string
          id?: string
          is_active?: boolean | null
          rate_to_usd: number
          updated_at?: string | null
        }
        Update: {
          country_code?: string
          currency_code?: string
          currency_symbol?: string
          id?: string
          is_active?: boolean | null
          rate_to_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_login_claims: {
        Row: {
          claimed_date: string
          created_at: string
          day_number: number
          id: string
          reward_coins: number
          reward_diamonds: number
          user_id: string
        }
        Insert: {
          claimed_date?: string
          created_at?: string
          day_number: number
          id?: string
          reward_coins?: number
          reward_diamonds?: number
          user_id: string
        }
        Update: {
          claimed_date?: string
          created_at?: string
          day_number?: number
          id?: string
          reward_coins?: number
          reward_diamonds?: number
          user_id?: string
        }
        Relationships: []
      }
      daily_login_rewards_config: {
        Row: {
          bonus_label: string | null
          created_at: string
          day_number: number
          id: string
          is_active: boolean
          reward_beans: number
          reward_coins: number
          reward_diamonds: number
        }
        Insert: {
          bonus_label?: string | null
          created_at?: string
          day_number: number
          id?: string
          is_active?: boolean
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
        }
        Update: {
          bonus_label?: string | null
          created_at?: string
          day_number?: number
          id?: string
          is_active?: boolean
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
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
          requirement_type: string
          requirement_value: number
          reward_beans: number | null
          reward_coins: number | null
          show_in_live: boolean | null
          target_audience: string
          task_type: string
          title: string
          updated_at: string | null
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
          requirement_type: string
          requirement_value?: number
          reward_beans?: number | null
          reward_coins?: number | null
          show_in_live?: boolean | null
          target_audience?: string
          task_type?: string
          title: string
          updated_at?: string | null
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
          requirement_type?: string
          requirement_value?: number
          reward_beans?: number | null
          reward_coins?: number | null
          show_in_live?: boolean | null
          target_audience?: string
          task_type?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          device_info: Json | null
          id: string
          is_active: boolean
          platform: string
          token: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_info?: Json | null
          id?: string
          is_active?: boolean
          platform: string
          token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_info?: Json | null
          id?: string
          is_active?: boolean
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_otps: {
        Row: {
          attempts: number
          created_at: string
          email: string
          expires_at: string
          id: string
          is_used: boolean
          otp_code: string
          purpose: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          is_used?: boolean
          otp_code: string
          purpose?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          otp_code?: string
          purpose?: string
        }
        Relationships: []
      }
      entertainment: {
        Row: {
          content_type: string | null
          created_at: string
          description: string | null
          episodes: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          season: number | null
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          description?: string | null
          episodes?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          season?: number | null
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          content_type?: string | null
          created_at?: string
          description?: string | null
          episodes?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          season?: number | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      entry_banners: {
        Row: {
          animation_url: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_ms: number | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          min_level: number | null
          min_vip_tier: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          updated_at: string
        }
        Insert: {
          animation_url: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          min_vip_tier?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number | null
          updated_at?: string
        }
        Update: {
          animation_url?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          min_vip_tier?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      entry_name_bars: {
        Row: {
          animation_url: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_ms: number | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          min_level: number | null
          min_vip_tier: number | null
          name: string
          preview_url: string | null
          price_diamonds: number | null
          updated_at: string
        }
        Insert: {
          animation_url: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          min_vip_tier?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number | null
          updated_at?: string
        }
        Update: {
          animation_url?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_ms?: number | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          min_level?: number | null
          min_vip_tier?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      face_records: {
        Row: {
          created_at: string
          face_embedding: string
          face_image_url: string | null
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          face_embedding: string
          face_image_url?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          face_embedding?: string
          face_image_url?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      face_verification_submissions: {
        Row: {
          admin_notes: string | null
          age: number | null
          created_at: string
          duplicate_face_avatar: string | null
          duplicate_face_name: string | null
          duplicate_face_uid: string | null
          duplicate_face_user_id: string | null
          face_image_url: string | null
          face_verified_at: string | null
          full_name: string | null
          host_photos: string[] | null
          id: string
          is_duplicate_face: boolean | null
          language: string | null
          profile_photo_url: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
          verification_type: string
          video_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          age?: number | null
          created_at?: string
          duplicate_face_avatar?: string | null
          duplicate_face_name?: string | null
          duplicate_face_uid?: string | null
          duplicate_face_user_id?: string | null
          face_image_url?: string | null
          face_verified_at?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          is_duplicate_face?: boolean | null
          language?: string | null
          profile_photo_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
          verification_type?: string
          video_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          age?: number | null
          created_at?: string
          duplicate_face_avatar?: string | null
          duplicate_face_name?: string | null
          duplicate_face_uid?: string | null
          duplicate_face_user_id?: string | null
          face_image_url?: string | null
          face_verified_at?: string | null
          full_name?: string | null
          host_photos?: string[] | null
          id?: string
          is_duplicate_face?: boolean | null
          language?: string | null
          profile_photo_url?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          verification_type?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "face_verification_submissions_duplicate_face_user_id_fkey"
            columns: ["duplicate_face_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "face_verification_submissions_duplicate_face_user_id_fkey"
            columns: ["duplicate_face_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
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
          attempt_count: number | null
          email: string | null
          first_attempt_at: string | null
          id: string
          ip_address: unknown
          is_blocked: boolean | null
          last_attempt_at: string | null
          user_agent: string | null
        }
        Insert: {
          attempt_count?: number | null
          email?: string | null
          first_attempt_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_attempt_at?: string | null
          user_agent?: string | null
        }
        Update: {
          attempt_count?: number | null
          email?: string | null
          first_attempt_at?: string | null
          id?: string
          ip_address?: unknown
          is_blocked?: boolean | null
          last_attempt_at?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      feature_level_requirements: {
        Row: {
          category: string | null
          created_at: string
          display_order: number | null
          feature_description: string | null
          feature_key: string
          feature_name: string
          icon_name: string | null
          id: string
          is_active: boolean
          min_level_host: number
          min_level_user: number
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_order?: number | null
          feature_description?: string | null
          feature_key: string
          feature_name: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          min_level_host?: number
          min_level_user?: number
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          display_order?: number | null
          feature_description?: string | null
          feature_key?: string
          feature_name?: string
          icon_name?: string | null
          id?: string
          is_active?: boolean
          min_level_host?: number
          min_level_user?: number
          updated_at?: string
        }
        Relationships: []
      }
      first_recharge_bonus: {
        Row: {
          banner_image_url: string | null
          banner_subtitle: string | null
          banner_title: string | null
          banner_type: string | null
          bonus_label: string
          bonus_multiplier: number
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          min_package_amount: number | null
          updated_at: string
        }
        Insert: {
          banner_image_url?: string | null
          banner_subtitle?: string | null
          banner_title?: string | null
          banner_type?: string | null
          bonus_label?: string
          bonus_multiplier?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_package_amount?: number | null
          updated_at?: string
        }
        Update: {
          banner_image_url?: string | null
          banner_subtitle?: string | null
          banner_title?: string | null
          banner_type?: string | null
          bonus_label?: string
          bonus_multiplier?: number
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          min_package_amount?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      first_recharge_claims: {
        Row: {
          bonus_coins: number
          claimed_at: string
          id: string
          original_coins: number
          package_id: string | null
          total_coins: number
          user_id: string
        }
        Insert: {
          bonus_coins: number
          claimed_at?: string
          id?: string
          original_coins: number
          package_id?: string | null
          total_coins: number
          user_id: string
        }
        Update: {
          bonus_coins?: number
          claimed_at?: string
          id?: string
          original_coins?: number
          package_id?: string | null
          total_coins?: number
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
        Relationships: [
          {
            foreignKeyName: "followers_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_bets: {
        Row: {
          bet_amount: number
          bet_type: string | null
          bet_value: string | null
          created_at: string | null
          game_data: Json | null
          game_id: string
          id: string
          is_winner: boolean | null
          multiplier: number | null
          result: string | null
          session_id: string | null
          user_id: string
          win_amount: number | null
        }
        Insert: {
          bet_amount: number
          bet_type?: string | null
          bet_value?: string | null
          created_at?: string | null
          game_data?: Json | null
          game_id: string
          id?: string
          is_winner?: boolean | null
          multiplier?: number | null
          result?: string | null
          session_id?: string | null
          user_id: string
          win_amount?: number | null
        }
        Update: {
          bet_amount?: number
          bet_type?: string | null
          bet_value?: string | null
          created_at?: string | null
          game_data?: Json | null
          game_id?: string
          id?: string
          is_winner?: boolean | null
          multiplier?: number | null
          result?: string | null
          session_id?: string | null
          user_id?: string
          win_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_bets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_configs: {
        Row: {
          available_in: string[] | null
          created_at: string | null
          description: string | null
          display_order: number | null
          game_items: Json | null
          game_key: string
          game_name: string
          game_name_bn: string | null
          game_type: string
          house_edge_percent: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          max_bet: number | null
          min_bet: number | null
          payout_multipliers: Json | null
          preview_url: string | null
          updated_at: string | null
        }
        Insert: {
          available_in?: string[] | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_items?: Json | null
          game_key: string
          game_name: string
          game_name_bn?: string | null
          game_type?: string
          house_edge_percent?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          payout_multipliers?: Json | null
          preview_url?: string | null
          updated_at?: string | null
        }
        Update: {
          available_in?: string[] | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_items?: Json | null
          game_key?: string
          game_name?: string
          game_name_bn?: string | null
          game_type?: string
          house_edge_percent?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_bet?: number | null
          min_bet?: number | null
          payout_multipliers?: Json | null
          preview_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      game_players: {
        Row: {
          id: string
          is_active: boolean | null
          joined_at: string | null
          position: number | null
          score: number | null
          session_id: string
          user_id: string
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          position?: number | null
          score?: number | null
          session_id: string
          user_id: string
        }
        Update: {
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          position?: number | null
          score?: number | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_players_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_players_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_provider_logs: {
        Row: {
          created_at: string | null
          endpoint: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          log_type: string
          provider_id: string | null
          request_data: Json | null
          response_data: Json | null
          status_code: number | null
        }
        Insert: {
          created_at?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          log_type: string
          provider_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status_code?: number | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          log_type?: string
          provider_id?: string | null
          request_data?: Json | null
          response_data?: Json | null
          status_code?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_provider_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "game_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      game_providers: {
        Row: {
          api_key: string | null
          api_secret: string | null
          api_url: string | null
          app_id: string | null
          available_games: Json | null
          created_at: string | null
          description: string | null
          documentation_url: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          last_tested_at: string | null
          logo_url: string | null
          merchant_id: string | null
          provider_id: string
          provider_name: string
          provider_type: string
          sdk_config: Json | null
          test_result: string | null
          updated_at: string | null
          website_url: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          api_url?: string | null
          app_id?: string | null
          available_games?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_tested_at?: string | null
          logo_url?: string | null
          merchant_id?: string | null
          provider_id: string
          provider_name: string
          provider_type?: string
          sdk_config?: Json | null
          test_result?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          api_url?: string | null
          app_id?: string | null
          available_games?: Json | null
          created_at?: string | null
          description?: string | null
          documentation_url?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          last_tested_at?: string | null
          logo_url?: string | null
          merchant_id?: string | null
          provider_id?: string
          provider_name?: string
          provider_type?: string
          sdk_config?: Json | null
          test_result?: string | null
          updated_at?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      game_server_settings: {
        Row: {
          auto_process_enabled: boolean | null
          betting_duration_seconds: number | null
          created_at: string | null
          global_house_edge: number | null
          id: string
          is_active: boolean | null
          maintenance_message: string | null
          maintenance_mode: boolean | null
          max_total_payout_per_round: number | null
          round_interval_seconds: number | null
          server_name: string
          updated_at: string | null
        }
        Insert: {
          auto_process_enabled?: boolean | null
          betting_duration_seconds?: number | null
          created_at?: string | null
          global_house_edge?: number | null
          id?: string
          is_active?: boolean | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          max_total_payout_per_round?: number | null
          round_interval_seconds?: number | null
          server_name?: string
          updated_at?: string | null
        }
        Update: {
          auto_process_enabled?: boolean | null
          betting_duration_seconds?: number | null
          created_at?: string | null
          global_house_edge?: number | null
          id?: string
          is_active?: boolean | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          max_total_payout_per_round?: number | null
          round_interval_seconds?: number | null
          server_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      game_sessions: {
        Row: {
          bet_amount: number | null
          created_at: string | null
          current_players: number | null
          ended_at: string | null
          game_data: Json | null
          game_type: string
          id: string
          max_players: number | null
          room_id: string | null
          started_at: string | null
          status: string | null
          winner_id: string | null
        }
        Insert: {
          bet_amount?: number | null
          created_at?: string | null
          current_players?: number | null
          ended_at?: string | null
          game_data?: Json | null
          game_type: string
          id?: string
          max_players?: number | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          winner_id?: string | null
        }
        Update: {
          bet_amount?: number | null
          created_at?: string | null
          current_players?: number | null
          ended_at?: string | null
          game_data?: Json | null
          game_type?: string
          id?: string
          max_players?: number | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      game_settings: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          game_color: string
          game_emoji: string
          game_id: string
          game_name: string
          game_type: string | null
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
          updated_at: string | null
          win_probability: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_color: string
          game_emoji: string
          game_id: string
          game_name: string
          game_type?: string | null
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
          updated_at?: string | null
          win_probability?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          game_color?: string
          game_emoji?: string
          game_id?: string
          game_name?: string
          game_type?: string | null
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
          updated_at?: string | null
          win_probability?: number | null
        }
        Relationships: []
      }
      game_stats: {
        Row: {
          created_at: string | null
          game_id: string
          house_profit: number | null
          id: string
          stat_date: string | null
          total_bet_amount: number | null
          total_bets: number | null
          total_win_amount: number | null
          total_wins: number | null
          unique_players: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_id: string
          house_profit?: number | null
          id?: string
          stat_date?: string | null
          total_bet_amount?: number | null
          total_bets?: number | null
          total_win_amount?: number | null
          total_wins?: number | null
          unique_players?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_id?: string
          house_profit?: number | null
          id?: string
          stat_date?: string | null
          total_bet_amount?: number | null
          total_bets?: number | null
          total_win_amount?: number | null
          total_wins?: number | null
          unique_players?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      game_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string | null
          details: Json | null
          game_id: string
          game_name: string | null
          id: string
          multiplier: number | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          details?: Json | null
          game_id: string
          game_name?: string | null
          id?: string
          multiplier?: number | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          details?: Json | null
          game_id?: string
          game_name?: string | null
          id?: string
          multiplier?: number | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
          beans_amount: number
          coin_amount: number
          company_amount: number
          created_at: string | null
          credited_at: string | null
          credited_by: string | null
          error_message: string | null
          gift_id: string
          gift_name: string | null
          id: string
          notes: string | null
          receiver_id: string
          sender_id: string
          status: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          beans_amount: number
          coin_amount: number
          company_amount: number
          created_at?: string | null
          credited_at?: string | null
          credited_by?: string | null
          error_message?: string | null
          gift_id: string
          gift_name?: string | null
          id?: string
          notes?: string | null
          receiver_id: string
          sender_id: string
          status?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          beans_amount?: number
          coin_amount?: number
          company_amount?: number
          created_at?: string | null
          credited_at?: string | null
          credited_by?: string | null
          error_message?: string | null
          gift_id?: string
          gift_name?: string | null
          id?: string
          notes?: string | null
          receiver_id?: string
          sender_id?: string
          status?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_transaction_logs_credited_by_fkey"
            columns: ["credited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_credited_by_fkey"
            columns: ["credited_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transaction_logs_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "gift_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_transactions: {
        Row: {
          call_id: string | null
          coin_amount: number
          created_at: string | null
          gift_id: string
          id: string
          party_room_id: string | null
          quantity: number
          receiver_id: string
          reel_id: string | null
          sender_id: string
          stream_id: string | null
        }
        Insert: {
          call_id?: string | null
          coin_amount: number
          created_at?: string | null
          gift_id: string
          id?: string
          party_room_id?: string | null
          quantity?: number
          receiver_id: string
          reel_id?: string | null
          sender_id: string
          stream_id?: string | null
        }
        Update: {
          call_id?: string | null
          coin_amount?: number
          created_at?: string | null
          gift_id?: string
          id?: string
          party_room_id?: string | null
          quantity?: number
          receiver_id?: string
          reel_id?: string | null
          sender_id?: string
          stream_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gift_transactions_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_transactions_party_room_id_fkey"
            columns: ["party_room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
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
            foreignKeyName: "gift_transactions_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
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
          coin_price: number | null
          coin_value: number
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          sound_duration_ms: number | null
          sound_url: string | null
        }
        Insert: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          coin_price?: number | null
          coin_value: number
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          sound_duration_ms?: number | null
          sound_url?: string | null
        }
        Update: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          coin_price?: number | null
          coin_value?: number
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          sound_duration_ms?: number | null
          sound_url?: string | null
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
        Relationships: [
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string | null
          encryption_version: number | null
          group_id: string
          id: string
          is_encrypted: boolean | null
          message_type: string | null
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          encryption_version?: number | null
          group_id: string
          id?: string
          is_encrypted?: boolean | null
          message_type?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          encryption_version?: number | null
          group_id?: string
          id?: string
          is_encrypted?: boolean | null
          message_type?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
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
          description: string | null
          group_code: string
          group_type: string
          id: string
          is_active: boolean | null
          member_count: number | null
          name: string
          owner_id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          group_code?: string
          group_type?: string
          id?: string
          is_active?: boolean | null
          member_count?: number | null
          name: string
          owner_id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          description?: string | null
          group_code?: string
          group_type?: string
          id?: string
          is_active?: boolean | null
          member_count?: number | null
          name?: string
          owner_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_admin_messages: {
        Row: {
          attachments: string[] | null
          created_at: string | null
          has_replies: boolean | null
          helper_id: string
          id: string
          is_read: boolean | null
          last_reply_at: string | null
          message: string
          priority: string | null
          read_at: string | null
          sender_id: string | null
          sender_type: string
          title: string
        }
        Insert: {
          attachments?: string[] | null
          created_at?: string | null
          has_replies?: boolean | null
          helper_id: string
          id?: string
          is_read?: boolean | null
          last_reply_at?: string | null
          message: string
          priority?: string | null
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
          title: string
        }
        Update: {
          attachments?: string[] | null
          created_at?: string | null
          has_replies?: boolean | null
          helper_id?: string
          id?: string
          is_read?: boolean | null
          last_reply_at?: string | null
          message?: string
          priority?: string | null
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_admin_messages_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_applications: {
        Row: {
          admin_notes: string | null
          agency_id: string | null
          contact_phone: string | null
          contact_telegram: string | null
          contact_whatsapp: string | null
          country: string | null
          created_at: string | null
          full_address: string | null
          id: string
          id_card_back_url: string | null
          id_card_front_url: string | null
          id_card_name: string | null
          id_card_number: string | null
          payment_details: Json | null
          payment_method: string | null
          payment_screenshot_url: string | null
          payment_transaction_id: string | null
          payroll_requested: boolean | null
          reason: string | null
          requested_level: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          agency_id?: string | null
          contact_phone?: string | null
          contact_telegram?: string | null
          contact_whatsapp?: string | null
          country?: string | null
          created_at?: string | null
          full_address?: string | null
          id?: string
          id_card_back_url?: string | null
          id_card_front_url?: string | null
          id_card_name?: string | null
          id_card_number?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_screenshot_url?: string | null
          payment_transaction_id?: string | null
          payroll_requested?: boolean | null
          reason?: string | null
          requested_level?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          agency_id?: string | null
          contact_phone?: string | null
          contact_telegram?: string | null
          contact_whatsapp?: string | null
          country?: string | null
          created_at?: string | null
          full_address?: string | null
          id?: string
          id_card_back_url?: string | null
          id_card_front_url?: string | null
          id_card_name?: string | null
          id_card_number?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          payment_screenshot_url?: string | null
          payment_transaction_id?: string | null
          payroll_requested?: boolean | null
          reason?: string | null
          requested_level?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_applications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_applications_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_assigned_countries: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          country_code: string
          helper_id: string
          id: string
          is_active: boolean | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          country_code: string
          helper_id: string
          id?: string
          is_active?: boolean | null
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          country_code?: string
          helper_id?: string
          id?: string
          is_active?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_assigned_countries_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_country_payment_methods: {
        Row: {
          account_name: string
          account_number: string
          additional_info: Json | null
          bank_name: string | null
          country_code: string
          created_at: string | null
          display_order: number | null
          helper_id: string
          id: string
          instructions: string | null
          is_active: boolean | null
          is_merchant: boolean | null
          logo_url: string | null
          max_amount: number | null
          merchant_number: string | null
          method_name: string
          method_type: string
          min_amount: number | null
          qr_code_url: string | null
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          additional_info?: Json | null
          bank_name?: string | null
          country_code: string
          created_at?: string | null
          display_order?: number | null
          helper_id: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          is_merchant?: boolean | null
          logo_url?: string | null
          max_amount?: number | null
          merchant_number?: string | null
          method_name: string
          method_type?: string
          min_amount?: number | null
          qr_code_url?: string | null
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          additional_info?: Json | null
          bank_name?: string | null
          country_code?: string
          created_at?: string | null
          display_order?: number | null
          helper_id?: string
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          is_merchant?: boolean | null
          logo_url?: string | null
          max_amount?: number | null
          merchant_number?: string | null
          method_name?: string
          method_type?: string
          min_amount?: number | null
          qr_code_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_country_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_diamond_packages: {
        Row: {
          created_at: string | null
          currency_code: string | null
          diamond_amount: number
          id: string
          is_active: boolean | null
          level_number: number
          price_local: number | null
          price_usd: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency_code?: string | null
          diamond_amount?: number
          id?: string
          is_active?: boolean | null
          level_number: number
          price_local?: number | null
          price_usd?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency_code?: string | null
          diamond_amount?: number
          id?: string
          is_active?: boolean | null
          level_number?: number
          price_local?: number | null
          price_usd?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      helper_level_config: {
        Row: {
          commission_rate: number | null
          created_at: string | null
          features: Json | null
          has_payroll_access: boolean | null
          has_withdrawal_processing: boolean | null
          id: string
          is_enabled: boolean | null
          level_name: string
          level_number: number
          max_withdrawal: number | null
          min_withdrawal: number | null
          updated_at: string | null
        }
        Insert: {
          commission_rate?: number | null
          created_at?: string | null
          features?: Json | null
          has_payroll_access?: boolean | null
          has_withdrawal_processing?: boolean | null
          id?: string
          is_enabled?: boolean | null
          level_name: string
          level_number: number
          max_withdrawal?: number | null
          min_withdrawal?: number | null
          updated_at?: string | null
        }
        Update: {
          commission_rate?: number | null
          created_at?: string | null
          features?: Json | null
          has_payroll_access?: boolean | null
          has_withdrawal_processing?: boolean | null
          id?: string
          is_enabled?: boolean | null
          level_name?: string
          level_number?: number
          max_withdrawal?: number | null
          min_withdrawal?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      helper_message_replies: {
        Row: {
          attachments: string[] | null
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          message_id: string
          read_at: string | null
          screenshot_url: string | null
          sender_id: string
          sender_type: string
        }
        Insert: {
          attachments?: string[] | null
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id: string
          read_at?: string | null
          screenshot_url?: string | null
          sender_id: string
          sender_type?: string
        }
        Update: {
          attachments?: string[] | null
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message_id?: string
          read_at?: string | null
          screenshot_url?: string | null
          sender_id?: string
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_message_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "helper_admin_messages"
            referencedColumns: ["id"]
          },
        ]
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
          type: string
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
        Relationships: [
          {
            foreignKeyName: "helper_notifications_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_orders: {
        Row: {
          amount_local: number
          amount_usd: number
          coin_amount: number
          created_at: string | null
          currency_code: string | null
          helper_id: string
          helper_notes: string | null
          id: string
          package_id: string | null
          payment_account_name: string | null
          payment_account_number: string | null
          payment_details: Json | null
          payment_method: string
          processed_at: string | null
          status: string | null
          user_country_code: string | null
          user_id: string
          user_payment_proof: string | null
        }
        Insert: {
          amount_local: number
          amount_usd: number
          coin_amount: number
          created_at?: string | null
          currency_code?: string | null
          helper_id: string
          helper_notes?: string | null
          id?: string
          package_id?: string | null
          payment_account_name?: string | null
          payment_account_number?: string | null
          payment_details?: Json | null
          payment_method: string
          processed_at?: string | null
          status?: string | null
          user_country_code?: string | null
          user_id: string
          user_payment_proof?: string | null
        }
        Update: {
          amount_local?: number
          amount_usd?: number
          coin_amount?: number
          created_at?: string | null
          currency_code?: string | null
          helper_id?: string
          helper_notes?: string | null
          id?: string
          package_id?: string | null
          payment_account_name?: string | null
          payment_account_number?: string | null
          payment_details?: Json | null
          payment_method?: string
          processed_at?: string | null
          status?: string | null
          user_country_code?: string | null
          user_id?: string
          user_payment_proof?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_orders_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "coin_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_orders_user_id_fkey"
            columns: ["user_id"]
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
          bank_name: string | null
          country_code: string
          created_at: string | null
          helper_id: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_merchant: boolean | null
          logo_url: string | null
          merchant_number: string | null
          payment_type: string
          updated_at: string | null
        }
        Insert: {
          account_name: string
          account_number: string
          additional_info?: Json | null
          bank_name?: string | null
          country_code: string
          created_at?: string | null
          helper_id: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_merchant?: boolean | null
          logo_url?: string | null
          merchant_number?: string | null
          payment_type: string
          updated_at?: string | null
        }
        Update: {
          account_name?: string
          account_number?: string
          additional_info?: Json | null
          bank_name?: string | null
          country_code?: string
          created_at?: string | null
          helper_id?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_merchant?: boolean | null
          logo_url?: string | null
          merchant_number?: string | null
          payment_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_payment_methods_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_topup_requests: {
        Row: {
          admin_notes: string | null
          amount_usd: number
          coin_amount: number
          created_at: string
          helper_id: string
          id: string
          notes: string | null
          payment_method: string
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_usd: number
          coin_amount: number
          created_at?: string
          helper_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_usd?: number
          coin_amount?: number
          created_at?: string
          helper_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_topup_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_transactions: {
        Row: {
          coin_amount: number
          created_at: string | null
          currency_code: string | null
          helper_id: string
          id: string
          local_amount: number | null
          notes: string | null
          payment_details: Json | null
          payment_method: string | null
          processed_at: string | null
          processed_by: string | null
          status: string | null
          transaction_type: string
          usd_amount: number
          user_id: string | null
        }
        Insert: {
          coin_amount?: number
          created_at?: string | null
          currency_code?: string | null
          helper_id: string
          id?: string
          local_amount?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_type: string
          usd_amount?: number
          user_id?: string | null
        }
        Update: {
          coin_amount?: number
          created_at?: string | null
          currency_code?: string | null
          helper_id?: string
          id?: string
          local_amount?: number | null
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          transaction_type?: string
          usd_amount?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_transactions_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_transactions_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          amount_usd: number
          created_at: string
          helper_id: string
          id: string
          notes: string | null
          payment_method: string
          payment_proof_url: string | null
          requested_level: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount_usd: number
          created_at?: string
          helper_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          requested_level: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount_usd?: number
          created_at?: string
          helper_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          payment_proof_url?: string | null
          requested_level?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "helper_upgrade_requests_helper_id_fkey"
            columns: ["helper_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      helper_withdrawal_requests: {
        Row: {
          admin_notes: string | null
          agency_id: string | null
          approved_at: string | null
          approved_by: string | null
          beans_amount: number
          created_at: string | null
          currency_code: string | null
          diamond_reward: number | null
          exchange_rate: number | null
          helper_id: string
          helper_notes: string | null
          host_id: string | null
          id: string
          local_amount: number
          paid_at: string | null
          payment_method: string | null
          payment_screenshot_url: string | null
          status: string | null
          submitted_at: string | null
          updated_at: string | null
          usd_amount: number
          withdrawal_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beans_amount?: number
          created_at?: string | null
          currency_code?: string | null
          diamond_reward?: number | null
          exchange_rate?: number | null
          helper_id: string
          helper_notes?: string | null
          host_id?: string | null
          id?: string
          local_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          payment_screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          usd_amount?: number
          withdrawal_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          agency_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          beans_amount?: number
          created_at?: string | null
          currency_code?: string | null
          diamond_reward?: number | null
          exchange_rate?: number | null
          helper_id?: string
          helper_notes?: string | null
          host_id?: string | null
          id?: string
          local_amount?: number
          paid_at?: string | null
          payment_method?: string | null
          payment_screenshot_url?: string | null
          status?: string | null
          submitted_at?: string | null
          updated_at?: string | null
          usd_amount?: number
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "helper_withdrawal_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "helper_withdrawal_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
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
          {
            foreignKeyName: "helper_withdrawal_requests_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "agency_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      host_applications: {
        Row: {
          admin_notes: string | null
          age: number
          created_at: string
          current_step: number
          face_match_score: number | null
          face_verification_image_url: string | null
          face_verification_status: string | null
          full_name: string
          id: string
          is_complete: boolean
          language: string
          photo_url: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_id: string
          video_duration_seconds: number | null
          video_url: string | null
        }
        Insert: {
          admin_notes?: string | null
          age: number
          created_at?: string
          current_step?: number
          face_match_score?: number | null
          face_verification_image_url?: string | null
          face_verification_status?: string | null
          full_name: string
          id?: string
          is_complete?: boolean
          language: string
          photo_url: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Update: {
          admin_notes?: string | null
          age?: number
          created_at?: string
          current_step?: number
          face_match_score?: number | null
          face_verification_image_url?: string | null
          face_verification_status?: string | null
          full_name?: string
          id?: string
          is_complete?: boolean
          language?: string
          photo_url?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
          video_duration_seconds?: number | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "host_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      host_contact_violations: {
        Row: {
          beans_deducted: number
          created_at: string
          detected_content: string
          detected_pattern: string
          host_id: string
          id: string
          is_auto_detected: boolean
          is_reviewed: boolean
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string | null
          source_type: string
          violation_number: number
          violation_type: string
        }
        Insert: {
          beans_deducted?: number
          created_at?: string
          detected_content?: string
          detected_pattern?: string
          host_id: string
          id?: string
          is_auto_detected?: boolean
          is_reviewed?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string
          violation_number?: number
          violation_type?: string
        }
        Update: {
          beans_deducted?: number
          created_at?: string
          detected_content?: string
          detected_pattern?: string
          host_id?: string
          id?: string
          is_auto_detected?: boolean
          is_reviewed?: boolean
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string | null
          source_type?: string
          violation_number?: number
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "host_contact_violations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_contact_violations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_contact_violations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "host_contact_violations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      host_conversion_requests: {
        Row: {
          admin_id: string | null
          admin_response: string | null
          created_at: string
          id: string
          message: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          admin_response?: string | null
          created_at?: string
          id?: string
          message: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_id?: string | null
          admin_response?: string | null
          created_at?: string
          id?: string
          message?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      host_levels: {
        Row: {
          beans_required: number
          created_at: string | null
          id: string
          is_active: boolean | null
          level_name: string | null
          level_number: number
        }
        Insert: {
          beans_required?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name?: string | null
          level_number: number
        }
        Update: {
          beans_required?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level_name?: string | null
          level_number?: number
        }
        Relationships: []
      }
      invitation_reward_claims: {
        Row: {
          beans_awarded: number
          claimed_at: string
          coins_awarded: number
          id: string
          invite_count_at_claim: number
          tier_id: string
          user_id: string
        }
        Insert: {
          beans_awarded?: number
          claimed_at?: string
          coins_awarded?: number
          id?: string
          invite_count_at_claim?: number
          tier_id: string
          user_id: string
        }
        Update: {
          beans_awarded?: number
          claimed_at?: string
          coins_awarded?: number
          id?: string
          invite_count_at_claim?: number
          tier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitation_reward_claims_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "invitation_settings"
            referencedColumns: ["id"]
          },
        ]
      }
      invitation_settings: {
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
      iptv_sources: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      kids_content: {
        Row: {
          age_group: string | null
          content_type: string | null
          created_at: string
          description: string | null
          duration: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          age_group?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          age_group?: string | null
          content_type?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      landing_page_sections: {
        Row: {
          badge_text: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          end_date: string | null
          gradient_colors: string | null
          icon_name: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          link_label: string | null
          link_url: string | null
          section_type: string
          start_date: string | null
          subtitle: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          badge_text?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          gradient_colors?: string | null
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_label?: string | null
          link_url?: string | null
          section_type: string
          start_date?: string | null
          subtitle?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          badge_text?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          end_date?: string | null
          gradient_colors?: string | null
          icon_name?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          link_label?: string | null
          link_url?: string | null
          section_type?: string
          start_date?: string | null
          subtitle?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_podium_frames: {
        Row: {
          category: string
          created_at: string | null
          frame_type: string | null
          frame_url: string
          id: string
          is_active: boolean | null
          name: string
          rank_position: number
          updated_at: string | null
        }
        Insert: {
          category?: string
          created_at?: string | null
          frame_type?: string | null
          frame_url: string
          id?: string
          is_active?: boolean | null
          name?: string
          rank_position: number
          updated_at?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          frame_type?: string | null
          frame_url?: string
          id?: string
          is_active?: boolean | null
          name?: string
          rank_position?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_reward_config: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean | null
          min_target: number | null
          period_type: string
          rank_from: number
          rank_to: number
          reward_badge: string | null
          reward_beans: number
          reward_coins: number
          reward_diamonds: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          min_target?: number | null
          period_type: string
          rank_from?: number
          rank_to?: number
          reward_badge?: string | null
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          min_target?: number | null
          period_type?: string
          rank_from?: number
          rank_to?: number
          reward_badge?: string | null
          reward_beans?: number
          reward_coins?: number
          reward_diamonds?: number
          updated_at?: string
        }
        Relationships: []
      }
      leaderboard_reward_history: {
        Row: {
          agency_id: string | null
          category: string
          id: string
          period_label: string
          period_type: string
          rank_position: number
          reward_badge: string | null
          reward_beans: number | null
          reward_coins: number | null
          reward_diamonds: number | null
          sent_at: string
          sent_by: string | null
          stat_value: number | null
          user_id: string | null
        }
        Insert: {
          agency_id?: string | null
          category: string
          id?: string
          period_label: string
          period_type: string
          rank_position: number
          reward_badge?: string | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          sent_at?: string
          sent_by?: string | null
          stat_value?: number | null
          user_id?: string | null
        }
        Update: {
          agency_id?: string | null
          category?: string
          id?: string
          period_label?: string
          period_type?: string
          rank_position?: number
          reward_badge?: string | null
          reward_beans?: number | null
          reward_coins?: number | null
          reward_diamonds?: number | null
          sent_at?: string
          sent_by?: string | null
          stat_value?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboard_reward_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_reward_history_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_reward_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboard_reward_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      level_animations: {
        Row: {
          animation_type: string | null
          animation_url: string
          created_at: string | null
          display_name: string | null
          duration_ms: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level: number
          preview_url: string | null
          updated_at: string | null
        }
        Insert: {
          animation_type?: string | null
          animation_url: string
          created_at?: string | null
          display_name?: string | null
          duration_ms?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          preview_url?: string | null
          updated_at?: string | null
        }
        Update: {
          animation_type?: string | null
          animation_url?: string
          created_at?: string | null
          display_name?: string | null
          duration_ms?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          preview_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      level_privileges: {
        Row: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          icon_bg_color: string | null
          icon_color: string | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          name: string
          preview_url: string | null
          privilege_type: string
          unlock_level: number
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          preview_url?: string | null
          privilege_type: string
          unlock_level?: number
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          preview_url?: string | null
          privilege_type?: string
          unlock_level?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      limited_offer_claims: {
        Row: {
          bonus_received: number
          claimed_at: string
          coins_received: number
          id: string
          offer_id: string
          user_id: string
        }
        Insert: {
          bonus_received?: number
          claimed_at?: string
          coins_received?: number
          id?: string
          offer_id: string
          user_id: string
        }
        Update: {
          bonus_received?: number
          claimed_at?: string
          coins_received?: number
          id?: string
          offer_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "limited_offer_claims_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "limited_time_offers"
            referencedColumns: ["id"]
          },
        ]
      }
      limited_time_offers: {
        Row: {
          applicable_packages: string[] | null
          badge_text: string | null
          banner_image_url: string | null
          bonus_percentage: number | null
          created_at: string
          description: string | null
          ends_at: string
          id: string
          is_active: boolean
          max_claims_per_user: number | null
          offer_type: string
          starts_at: string
          title: string
          total_claimed: number
          total_max_claims: number | null
          updated_at: string
        }
        Insert: {
          applicable_packages?: string[] | null
          badge_text?: string | null
          banner_image_url?: string | null
          bonus_percentage?: number | null
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          max_claims_per_user?: number | null
          offer_type?: string
          starts_at?: string
          title: string
          total_claimed?: number
          total_max_claims?: number | null
          updated_at?: string
        }
        Update: {
          applicable_packages?: string[] | null
          badge_text?: string | null
          banner_image_url?: string | null
          bonus_percentage?: number | null
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          max_claims_per_user?: number | null
          offer_type?: string
          starts_at?: string
          title?: string
          total_claimed?: number
          total_max_claims?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      live_bans: {
        Row: {
          auto_banned: boolean | null
          ban_duration_hours: number | null
          ban_end: string | null
          ban_reason: string
          ban_start: string
          created_at: string | null
          id: string
          is_active: boolean | null
          unban_reason: string | null
          unbanned_at: string | null
          unbanned_by: string | null
          updated_at: string | null
          user_id: string
          violation_type: string
          warning_count: number | null
        }
        Insert: {
          auto_banned?: boolean | null
          ban_duration_hours?: number | null
          ban_end?: string | null
          ban_reason: string
          ban_start?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          unban_reason?: string | null
          unbanned_at?: string | null
          unbanned_by?: string | null
          updated_at?: string | null
          user_id: string
          violation_type?: string
          warning_count?: number | null
        }
        Update: {
          auto_banned?: boolean | null
          ban_duration_hours?: number | null
          ban_end?: string | null
          ban_reason?: string
          ban_start?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          unban_reason?: string | null
          unbanned_at?: string | null
          unbanned_by?: string | null
          updated_at?: string | null
          user_id?: string
          violation_type?: string
          warning_count?: number | null
        }
        Relationships: []
      }
      live_face_violations: {
        Row: {
          action_taken: string | null
          admin_reviewed: boolean | null
          auto_closed: boolean | null
          countdown_duration: number | null
          created_at: string
          detected_at: string
          host_id: string
          id: string
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          stream_id: string | null
          violation_type: string
        }
        Insert: {
          action_taken?: string | null
          admin_reviewed?: boolean | null
          auto_closed?: boolean | null
          countdown_duration?: number | null
          created_at?: string
          detected_at?: string
          host_id: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stream_id?: string | null
          violation_type?: string
        }
        Update: {
          action_taken?: string | null
          admin_reviewed?: boolean | null
          auto_closed?: boolean | null
          countdown_duration?: number | null
          created_at?: string
          detected_at?: string
          host_id?: string
          id?: string
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          stream_id?: string | null
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "live_face_violations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_face_violations_host_id_fkey"
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
          bet_type: string | null
          bet_value: string | null
          cashed_out_at: string | null
          created_at: string | null
          id: string
          is_processed: boolean | null
          is_winner: boolean | null
          multiplier: number | null
          round_id: string
          user_id: string
          win_amount: number | null
        }
        Insert: {
          bet_amount: number
          bet_type?: string | null
          bet_value?: string | null
          cashed_out_at?: string | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          is_winner?: boolean | null
          multiplier?: number | null
          round_id: string
          user_id: string
          win_amount?: number | null
        }
        Update: {
          bet_amount?: number
          bet_type?: string | null
          bet_value?: string | null
          cashed_out_at?: string | null
          created_at?: string | null
          id?: string
          is_processed?: boolean | null
          is_winner?: boolean | null
          multiplier?: number | null
          round_id?: string
          user_id?: string
          win_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "live_game_bets_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "live_game_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_game_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_game_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      live_game_rounds: {
        Row: {
          betting_end_at: string
          created_at: string | null
          game_end_at: string | null
          game_id: string
          game_start_at: string | null
          id: string
          result: Json | null
          room_id: string | null
          round_number: number
          status: string
          total_bet_amount: number | null
          total_bets: number | null
          total_players: number | null
          winning_value: string | null
        }
        Insert: {
          betting_end_at: string
          created_at?: string | null
          game_end_at?: string | null
          game_id: string
          game_start_at?: string | null
          id?: string
          result?: Json | null
          room_id?: string | null
          round_number?: number
          status?: string
          total_bet_amount?: number | null
          total_bets?: number | null
          total_players?: number | null
          winning_value?: string | null
        }
        Update: {
          betting_end_at?: string
          created_at?: string | null
          game_end_at?: string | null
          game_id?: string
          game_start_at?: string | null
          id?: string
          result?: Json | null
          room_id?: string | null
          round_number?: number
          status?: string
          total_bet_amount?: number | null
          total_bets?: number | null
          total_players?: number | null
          winning_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_game_rounds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      live_moderation_settings: {
        Row: {
          description: string | null
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          description?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          description?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      live_streams: {
        Row: {
          created_at: string | null
          current_music_title: string | null
          current_music_url: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_active: boolean | null
          last_heartbeat: string | null
          music_playing: boolean | null
          music_started_at: string | null
          started_at: string | null
          thumbnail_url: string | null
          title: string | null
          total_coins_earned: number | null
          total_gifts: number | null
          viewer_count: number | null
        }
        Insert: {
          created_at?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id: string
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          music_playing?: boolean | null
          music_started_at?: string | null
          started_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_coins_earned?: number | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Update: {
          created_at?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          description?: string | null
          ended_at?: string | null
          host_id?: string
          id?: string
          is_active?: boolean | null
          last_heartbeat?: string | null
          music_playing?: boolean | null
          music_started_at?: string | null
          started_at?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_coins_earned?: number | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Relationships: [
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
          auto_detected: boolean | null
          created_at: string | null
          detected_at: string | null
          id: string
          notes: string | null
          stream_id: string | null
          user_id: string
          violation_type: string
          warning_number: number
        }
        Insert: {
          auto_detected?: boolean | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          notes?: string | null
          stream_id?: string | null
          user_id: string
          violation_type: string
          warning_number?: number
        }
        Update: {
          auto_detected?: boolean | null
          created_at?: string | null
          detected_at?: string | null
          id?: string
          notes?: string | null
          stream_id?: string | null
          user_id?: string
          violation_type?: string
          warning_number?: number
        }
        Relationships: []
      }
      login_attempts: {
        Row: {
          attempt_at: string
          id: string
          identifier: string
          identifier_type: string
          ip_address: string | null
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          attempt_at?: string
          id?: string
          identifier: string
          identifier_type?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          attempt_at?: string
          id?: string
          identifier?: string
          identifier_type?: string
          ip_address?: string | null
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: []
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
          is_encrypted: boolean | null
          is_read: boolean | null
          message_type: string | null
          read_at: string | null
          sender_id: string
          status: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          delivered_at?: string | null
          encryption_version?: number | null
          id?: string
          is_ai_reply?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          read_at?: string | null
          sender_id: string
          status?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          delivered_at?: string | null
          encryption_version?: number | null
          id?: string
          is_ai_reply?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          message_type?: string | null
          read_at?: string | null
          sender_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      movies: {
        Row: {
          backdrop_url: string | null
          country: string | null
          created_at: string
          description: string | null
          duration: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          language: string | null
          poster_url: string | null
          rating: number | null
          release_year: number | null
          slug: string
          title: string
          trailer_url: string | null
          updated_at: string
          video_url: string | null
          view_count: number | null
        }
        Insert: {
          backdrop_url?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          language?: string | null
          poster_url?: string | null
          rating?: number | null
          release_year?: number | null
          slug: string
          title: string
          trailer_url?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number | null
        }
        Update: {
          backdrop_url?: string | null
          country?: string | null
          created_at?: string
          description?: string | null
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          language?: string | null
          poster_url?: string | null
          rating?: number | null
          release_year?: number | null
          slug?: string
          title?: string
          trailer_url?: string | null
          updated_at?: string
          video_url?: string | null
          view_count?: number | null
        }
        Relationships: []
      }
      music: {
        Row: {
          album: string | null
          artist: string | null
          audio_url: string | null
          created_at: string
          duration: number | null
          genre: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          play_count: number | null
          release_year: number | null
          slug: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          album?: string | null
          artist?: string | null
          audio_url?: string | null
          created_at?: string
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          play_count?: number | null
          release_year?: number | null
          slug: string
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          album?: string | null
          artist?: string | null
          audio_url?: string | null
          created_at?: string
          duration?: number | null
          genre?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          play_count?: number | null
          release_year?: number | null
          slug?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      new_host_live_bonus_progress: {
        Row: {
          beans_earned: number
          bonus_date: string
          created_at: string
          day_number: number
          hours_completed: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          beans_earned?: number
          bonus_date?: string
          created_at?: string
          day_number?: number
          hours_completed?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          beans_earned?: number
          bonus_date?: string
          created_at?: string
          day_number?: number
          hours_completed?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "new_host_live_bonus_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "new_host_live_bonus_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      new_host_live_bonus_settings: {
        Row: {
          beans_per_hour: number
          created_at: string
          description: string | null
          eligible_days: number
          id: string
          is_active: boolean
          max_hours_per_day: number
          updated_at: string
        }
        Insert: {
          beans_per_hour?: number
          created_at?: string
          description?: string | null
          eligible_days?: number
          id?: string
          is_active?: boolean
          max_hours_per_day?: number
          updated_at?: string
        }
        Update: {
          beans_per_hour?: number
          created_at?: string
          description?: string | null
          eligible_days?: number
          id?: string
          is_active?: boolean
          max_hours_per_day?: number
          updated_at?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          author: string | null
          category: string | null
          content: string | null
          created_at: string
          excerpt: string | null
          id: string
          is_active: boolean | null
          is_breaking: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          published_at: string | null
          slug: string
          source: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          author?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_active?: boolean | null
          is_breaking?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          published_at?: string | null
          slug: string
          source?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          author?: string | null
          category?: string | null
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          is_active?: boolean | null
          is_breaking?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          published_at?: string | null
          slug?: string
          source?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      news_sources: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_scraped_at: string | null
          logo_url: string | null
          name: string
          updated_at: string
          url: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          logo_url?: string | null
          name: string
          updated_at?: string
          url: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_scraped_at?: string | null
          logo_url?: string | null
          name?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          category: string | null
          description: string | null
          id: string
          message_template: string
          template_key: string
          title_template: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          description?: string | null
          id?: string
          message_template: string
          template_key: string
          title_template: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          description?: string | null
          id?: string
          message_template?: string
          template_key?: string
          title_template?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_slides: {
        Row: {
          created_at: string
          description: string
          display_order: number
          gradient: string
          id: string
          image_url: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          gradient?: string
          id?: string
          image_url: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          gradient?: string
          id?: string
          image_url?: string
          is_active?: boolean
          title?: string
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "parcel_claims_parcel_id_fkey"
            columns: ["parcel_id"]
            isOneToOne: true
            referencedRelation: "user_parcels"
            referencedColumns: ["id"]
          },
        ]
      }
      parcel_templates: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          expiry_hours: number | null
          glow_color: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          max_level: number | null
          min_level: number | null
          name: string
          parcel_type: string
          reward_amount: number
          reward_label: string | null
          reward_type: string
          target_segment: string | null
          unlock_condition: string
          unlock_threshold: number | null
          unlock_wait_hours: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expiry_hours?: number | null
          glow_color?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          max_level?: number | null
          min_level?: number | null
          name: string
          parcel_type?: string
          reward_amount?: number
          reward_label?: string | null
          reward_type?: string
          target_segment?: string | null
          unlock_condition?: string
          unlock_threshold?: number | null
          unlock_wait_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          expiry_hours?: number | null
          glow_color?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          max_level?: number | null
          min_level?: number | null
          name?: string
          parcel_type?: string
          reward_amount?: number
          reward_label?: string | null
          reward_type?: string
          target_segment?: string | null
          unlock_condition?: string
          unlock_threshold?: number | null
          unlock_wait_hours?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      party_room_backgrounds: {
        Row: {
          category: string | null
          created_at: string
          display_order: number | null
          gradient_css: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_premium: boolean | null
          name: string
          price_diamonds: number | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          display_order?: number | null
          gradient_css?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_premium?: boolean | null
          name: string
          price_diamonds?: number | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          display_order?: number | null
          gradient_css?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_premium?: boolean | null
          name?: string
          price_diamonds?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      party_room_banners: {
        Row: {
          amount: number | null
          banner_type: string
          created_at: string
          display_order: number | null
          gradient_from: string | null
          gradient_to: string | null
          icon_emoji: string | null
          id: string
          is_active: boolean | null
          link_type: string | null
          link_url: string | null
          min_room_level: number | null
          room_types: string[] | null
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          banner_type: string
          created_at?: string
          display_order?: number | null
          gradient_from?: string | null
          gradient_to?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          min_room_level?: number | null
          room_types?: string[] | null
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          banner_type?: string
          created_at?: string
          display_order?: number | null
          gradient_from?: string | null
          gradient_to?: string | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          link_type?: string | null
          link_url?: string | null
          min_room_level?: number | null
          room_types?: string[] | null
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      party_room_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          message_type: string | null
          room_id: string
          sender_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          message_type?: string | null
          room_id: string
          sender_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          message_type?: string | null
          room_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_room_messages_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_room_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_room_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      party_room_participants: {
        Row: {
          id: string
          joined_at: string | null
          left_at: string | null
          position: number | null
          role: string | null
          room_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          position?: number | null
          role?: string | null
          room_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          position?: number | null
          role?: string | null
          room_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
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
          active_seats: number | null
          background_id: string | null
          background_url: string | null
          created_at: string | null
          current_music_id: string | null
          current_music_title: string | null
          current_music_url: string | null
          current_participants: number | null
          description: string | null
          ended_at: string | null
          entry_fee: number | null
          game_mode: string | null
          host_id: string
          id: string
          is_active: boolean | null
          is_private: boolean | null
          max_participants: number | null
          min_level: number | null
          music_playing: boolean | null
          music_started_at: string | null
          name: string
          room_code: string
          room_type: string
        }
        Insert: {
          active_seats?: number | null
          background_id?: string | null
          background_url?: string | null
          created_at?: string | null
          current_music_id?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          current_participants?: number | null
          description?: string | null
          ended_at?: string | null
          entry_fee?: number | null
          game_mode?: string | null
          host_id: string
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          max_participants?: number | null
          min_level?: number | null
          music_playing?: boolean | null
          music_started_at?: string | null
          name: string
          room_code?: string
          room_type?: string
        }
        Update: {
          active_seats?: number | null
          background_id?: string | null
          background_url?: string | null
          created_at?: string | null
          current_music_id?: string | null
          current_music_title?: string | null
          current_music_url?: string | null
          current_participants?: number | null
          description?: string | null
          ended_at?: string | null
          entry_fee?: number | null
          game_mode?: string | null
          host_id?: string
          id?: string
          is_active?: boolean | null
          is_private?: boolean | null
          max_participants?: number | null
          min_level?: number | null
          music_playing?: boolean | null
          music_started_at?: string | null
          name?: string
          room_code?: string
          room_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_rooms_background_id_fkey"
            columns: ["background_id"]
            isOneToOne: false
            referencedRelation: "party_room_backgrounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "party_rooms_current_music_id_fkey"
            columns: ["current_music_id"]
            isOneToOne: false
            referencedRelation: "admin_music_library"
            referencedColumns: ["id"]
          },
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
          created_at: string
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
        }
        Update: {
          created_at?: string
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
          api_endpoint: string | null
          api_key_encrypted: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          fee_fixed: number | null
          fee_percentage: number | null
          gateway_code: string
          id: string
          is_active: boolean | null
          logo_url: string | null
          max_amount: number | null
          min_amount: number | null
          name: string
          payment_instructions: string | null
          payment_number: string | null
          secret_key_encrypted: string | null
          settings: Json | null
          supported_currencies: string[] | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_endpoint?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          fee_fixed?: number | null
          fee_percentage?: number | null
          gateway_code: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_amount?: number | null
          min_amount?: number | null
          name: string
          payment_instructions?: string | null
          payment_number?: string | null
          secret_key_encrypted?: string | null
          settings?: Json | null
          supported_currencies?: string[] | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_endpoint?: string | null
          api_key_encrypted?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          fee_fixed?: number | null
          fee_percentage?: number | null
          gateway_code?: string
          id?: string
          is_active?: boolean | null
          logo_url?: string | null
          max_amount?: number | null
          min_amount?: number | null
          name?: string
          payment_instructions?: string | null
          payment_number?: string | null
          secret_key_encrypted?: string | null
          settings?: Json | null
          supported_currencies?: string[] | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_name: string | null
          account_number: string | null
          additional_info: string | null
          bank_name: string | null
          country_code: string
          country_name: string
          created_at: string
          display_order: number | null
          id: string
          instructions: string | null
          is_active: boolean | null
          logo_url: string | null
          method_name: string
          method_type: string
          updated_at: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: string | null
          bank_name?: string | null
          country_code: string
          country_name: string
          created_at?: string
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          method_name: string
          method_type?: string
          updated_at?: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          additional_info?: string | null
          bank_name?: string | null
          country_code?: string
          country_name?: string
          created_at?: string
          display_order?: number | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          logo_url?: string | null
          method_name?: string
          method_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_reconciliation_log: {
        Row: {
          amount_coins: number | null
          amount_usd: number | null
          balance_after: number | null
          balance_before: number | null
          created_at: string
          event_type: string
          gateway: string
          id: string
          ip_address: string | null
          metadata: Json | null
          order_id: string | null
          transaction_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_coins?: number | null
          amount_usd?: number | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          event_type: string
          gateway: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          order_id?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_coins?: number | null
          amount_usd?: number | null
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string
          event_type?: string
          gateway?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          order_id?: string | null
          transaction_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount_local: number
          amount_usd: number
          callback_data: Json | null
          coins_to_receive: number
          completed_at: string | null
          created_at: string | null
          currency_code: string
          error_message: string | null
          gateway_id: string
          gateway_transaction_id: string | null
          id: string
          package_id: string | null
          payment_data: Json | null
          status: string | null
          transaction_ref: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_local: number
          amount_usd: number
          callback_data?: Json | null
          coins_to_receive: number
          completed_at?: string | null
          created_at?: string | null
          currency_code: string
          error_message?: string | null
          gateway_id: string
          gateway_transaction_id?: string | null
          id?: string
          package_id?: string | null
          payment_data?: Json | null
          status?: string | null
          transaction_ref?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_local?: number
          amount_usd?: number
          callback_data?: Json | null
          coins_to_receive?: number
          completed_at?: string | null
          created_at?: string | null
          currency_code?: string
          error_message?: string | null
          gateway_id?: string
          gateway_transaction_id?: string | null
          id?: string
          package_id?: string | null
          payment_data?: Json | null
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
            foreignKeyName: "payment_transactions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "coin_packages"
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
          agency_id: string
          agency_notes: string | null
          assigned_at: string | null
          beans_amount: number
          created_at: string | null
          id: string
          notes: string | null
          payment_details: Json | null
          payment_method: string | null
          processed_at: string | null
          status: string | null
          trader_id: string | null
          updated_at: string | null
          usd_amount: number
        }
        Insert: {
          agency_id: string
          agency_notes?: string | null
          assigned_at?: string | null
          beans_amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string | null
          trader_id?: string | null
          updated_at?: string | null
          usd_amount: number
        }
        Update: {
          agency_id?: string
          agency_notes?: string | null
          assigned_at?: string | null
          beans_amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string | null
          trader_id?: string | null
          updated_at?: string | null
          usd_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_requests_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_requests_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      phone_otps: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_used: boolean | null
          otp_code: string
          phone_number: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          otp_code: string
          phone_number: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          otp_code?: string
          phone_number?: string
        }
        Relationships: []
      }
      pk_battle_gifts: {
        Row: {
          battle_id: string
          coin_amount: number
          created_at: string
          gift_id: string
          id: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          battle_id: string
          coin_amount: number
          created_at?: string
          gift_id: string
          id?: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          battle_id?: string
          coin_amount?: number
          created_at?: string
          gift_id?: string
          id?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pk_battle_gifts_battle_id_fkey"
            columns: ["battle_id"]
            isOneToOne: false
            referencedRelation: "pk_battles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battle_gifts_gift_id_fkey"
            columns: ["gift_id"]
            isOneToOne: false
            referencedRelation: "gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battle_gifts_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battle_gifts_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battle_gifts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battle_gifts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      pk_battles: {
        Row: {
          challenger_id: string
          challenger_score: number
          challenger_stream_id: string | null
          created_at: string
          duration_seconds: number | null
          ended_at: string | null
          id: string
          opponent_id: string
          opponent_score: number
          opponent_stream_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          winner_id: string | null
        }
        Insert: {
          challenger_id: string
          challenger_score?: number
          challenger_stream_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          opponent_id: string
          opponent_score?: number
          opponent_stream_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Update: {
          challenger_id?: string
          challenger_score?: number
          challenger_stream_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          ended_at?: string | null
          id?: string
          opponent_id?: string
          opponent_score?: number
          opponent_stream_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pk_battles_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_challenger_id_fkey"
            columns: ["challenger_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_challenger_stream_id_fkey"
            columns: ["challenger_stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_opponent_id_fkey"
            columns: ["opponent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_opponent_stream_id_fkey"
            columns: ["opponent_stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_battles_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pk_competition_rewards_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "pk_competitions"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pk_participants_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "pk_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "pk_reward_history_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "pk_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_reward_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pk_reward_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "poster_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poster_images_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "private_call_security_logs_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "private_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_call_security_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_call_security_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
          started_at?: string | null
          status?: string
          stream_id?: string | null
          total_coins_deducted?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "private_calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_calls_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_calls_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_calls_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_session_id: string | null
          age: number | null
          agency_id: string | null
          app_uid: string | null
          avatar_url: string | null
          beans: number | null
          beans_balance: number | null
          bio: string | null
          blocked_at: string | null
          blocked_reason: string | null
          call_rate_per_minute: number | null
          city: string | null
          coins: number | null
          country_code: string | null
          country_flag: string | null
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
          face_verified_at: string | null
          frame_id: string | null
          gender: string | null
          hide_location: boolean
          host_level: number | null
          host_status: string | null
          host_verified_at: string | null
          id: string
          is_agency_owner: boolean | null
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_face_verified: boolean | null
          is_host: boolean | null
          is_in_call: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          last_login_at: string | null
          last_login_device: string | null
          last_login_device_info: Json | null
          last_login_ip: string | null
          last_seen_at: string | null
          max_user_level: number | null
          pending_earnings: number | null
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
          region: string | null
          registration_device_info: Json | null
          registration_ip: string | null
          registration_user_agent: string | null
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
          vip_expires_at: string | null
          weekly_earnings: number | null
          weekly_reset_at: string | null
        }
        Insert: {
          active_session_id?: string | null
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          beans?: number | null
          beans_balance?: number | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          coins?: number | null
          country_code?: string | null
          country_flag?: string | null
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
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean
          host_level?: number | null
          host_status?: string | null
          host_verified_at?: string | null
          id: string
          is_agency_owner?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_device_info?: Json | null
          last_login_ip?: string | null
          last_seen_at?: string | null
          max_user_level?: number | null
          pending_earnings?: number | null
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
          region?: string | null
          registration_device_info?: Json | null
          registration_ip?: string | null
          registration_user_agent?: string | null
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
          vip_expires_at?: string | null
          weekly_earnings?: number | null
          weekly_reset_at?: string | null
        }
        Update: {
          active_session_id?: string | null
          age?: number | null
          agency_id?: string | null
          app_uid?: string | null
          avatar_url?: string | null
          beans?: number | null
          beans_balance?: number | null
          bio?: string | null
          blocked_at?: string | null
          blocked_reason?: string | null
          call_rate_per_minute?: number | null
          city?: string | null
          coins?: number | null
          country_code?: string | null
          country_flag?: string | null
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
          face_verified_at?: string | null
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean
          host_level?: number | null
          host_status?: string | null
          host_verified_at?: string | null
          id?: string
          is_agency_owner?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_login_at?: string | null
          last_login_device?: string | null
          last_login_device_info?: Json | null
          last_login_ip?: string | null
          last_seen_at?: string | null
          max_user_level?: number | null
          pending_earnings?: number | null
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
          region?: string | null
          registration_device_info?: Json | null
          registration_ip?: string | null
          registration_user_agent?: string | null
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
          vip_expires_at?: string | null
          weekly_earnings?: number | null
          weekly_reset_at?: string | null
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
          {
            foreignKeyName: "profiles_current_vip_tier_id_fkey"
            columns: ["current_vip_tier_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "avatar_frames"
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
          iframe_url: string | null
          is_active: boolean | null
          is_featured: boolean | null
          max_bet: number | null
          metadata: Json | null
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
          iframe_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_bet?: number | null
          metadata?: Json | null
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
          iframe_url?: string | null
          is_active?: boolean | null
          is_featured?: boolean | null
          max_bet?: number | null
          metadata?: Json | null
          min_bet?: number | null
          provider_id?: string
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_games_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "game_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      ranking_rewards: {
        Row: {
          created_at: string | null
          id: string
          min_income_requirement: number | null
          period_type: string
          rank_position: number
          ranking_type: string
          reward_badge: string | null
          reward_coins: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          min_income_requirement?: number | null
          period_type: string
          rank_position: number
          ranking_type: string
          reward_badge?: string | null
          reward_coins?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          min_income_requirement?: number | null
          period_type?: string
          rank_position?: number
          ranking_type?: string
          reward_badge?: string | null
          reward_coins?: number | null
        }
        Relationships: []
      }
      rate_limit_attempts: {
        Row: {
          action_type: string
          attempted_at: string
          id: string
          identifier: string
        }
        Insert: {
          action_type: string
          attempted_at?: string
          id?: string
          identifier: string
        }
        Update: {
          action_type?: string
          attempted_at?: string
          id?: string
          identifier?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          ip_address: unknown
          request_count: number | null
          user_id: string | null
          window_start: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          ip_address?: unknown
          request_count?: number | null
          user_id?: string | null
          window_start?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          ip_address?: unknown
          request_count?: number | null
          user_id?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      rating_reward_claims: {
        Row: {
          created_at: string
          id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reward_amount: number
          reward_type: string
          screenshot_url: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount?: number
          reward_type?: string
          screenshot_url: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reward_amount?: number
          reward_type?: string
          screenshot_url?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rating_reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rating_reward_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      recharge_transactions: {
        Row: {
          agency_id: string | null
          agency_name: string | null
          agent_id: string | null
          agent_name: string | null
          amount: number
          coins_received: number
          completed_at: string | null
          created_at: string
          currency_code: string | null
          device_info: Json | null
          google_order_id: string | null
          google_product_id: string | null
          id: string
          ip_address: string | null
          local_currency_amount: number | null
          local_payment_number: string | null
          local_payment_provider: string | null
          notes: string | null
          payment_method: string
          purchase_source: string | null
          status: string
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          agency_id?: string | null
          agency_name?: string | null
          agent_id?: string | null
          agent_name?: string | null
          amount: number
          coins_received: number
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          device_info?: Json | null
          google_order_id?: string | null
          google_product_id?: string | null
          id?: string
          ip_address?: string | null
          local_currency_amount?: number | null
          local_payment_number?: string | null
          local_payment_provider?: string | null
          notes?: string | null
          payment_method?: string
          purchase_source?: string | null
          status?: string
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          agency_id?: string | null
          agency_name?: string | null
          agent_id?: string | null
          agent_name?: string | null
          amount?: number
          coins_received?: number
          completed_at?: string | null
          created_at?: string
          currency_code?: string | null
          device_info?: Json | null
          google_order_id?: string | null
          google_product_id?: string | null
          id?: string
          ip_address?: string | null
          local_currency_amount?: number | null
          local_payment_number?: string | null
          local_payment_provider?: string | null
          notes?: string | null
          payment_method?: string
          purchase_source?: string | null
          status?: string
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recharge_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_transactions_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recharge_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_tokens: {
        Row: {
          created_at: string | null
          device_id: string
          expires_at: string
          id: string
          is_used: boolean | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          token?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      reel_categories: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      reel_comments: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          like_count: number | null
          parent_id: string | null
          reel_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          like_count?: number | null
          parent_id?: string | null
          reel_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          like_count?: number | null
          parent_id?: string | null
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "reel_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_comments_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
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
          created_at: string | null
          id: string
          reel_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_likes_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reel_reports: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          reason: string
          reel_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          reason: string
          reel_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          reason?: string
          reel_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
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
            foreignKeyName: "reel_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
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
          created_at: string | null
          id: string
          reel_id: string
          share_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          reel_id: string
          share_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          reel_id?: string
          share_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reel_shares_reel_id_fkey"
            columns: ["reel_id"]
            isOneToOne: false
            referencedRelation: "reels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reel_shares_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reels: {
        Row: {
          beans_earned: number | null
          caption: string | null
          category_id: string | null
          comment_count: number | null
          created_at: string | null
          duration: number | null
          id: string
          is_active: boolean | null
          is_approved: boolean | null
          is_featured: boolean | null
          is_original_sound: boolean | null
          like_count: number | null
          music_artist: string | null
          music_title: string | null
          share_count: number | null
          sound_artist: string | null
          sound_audio_url: string | null
          sound_id: string | null
          sound_start_time: number | null
          sound_title: string | null
          thumbnail_url: string | null
          updated_at: string | null
          user_id: string
          video_url: string
          view_count: number | null
        }
        Insert: {
          beans_earned?: number | null
          caption?: string | null
          category_id?: string | null
          comment_count?: number | null
          created_at?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_featured?: boolean | null
          is_original_sound?: boolean | null
          like_count?: number | null
          music_artist?: string | null
          music_title?: string | null
          share_count?: number | null
          sound_artist?: string | null
          sound_audio_url?: string | null
          sound_id?: string | null
          sound_start_time?: number | null
          sound_title?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id: string
          video_url: string
          view_count?: number | null
        }
        Update: {
          beans_earned?: number | null
          caption?: string | null
          category_id?: string | null
          comment_count?: number | null
          created_at?: string | null
          duration?: number | null
          id?: string
          is_active?: boolean | null
          is_approved?: boolean | null
          is_featured?: boolean | null
          is_original_sound?: boolean | null
          like_count?: number | null
          music_artist?: string | null
          music_title?: string | null
          share_count?: number | null
          sound_artist?: string | null
          sound_audio_url?: string | null
          sound_id?: string | null
          sound_start_time?: number | null
          sound_title?: string | null
          thumbnail_url?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reels_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "reel_categories"
            referencedColumns: ["id"]
          },
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
      role_frames: {
        Row: {
          animation_type: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          frame_name: string
          frame_url: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          role_type: string
          updated_at: string | null
        }
        Insert: {
          animation_type?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          frame_name: string
          frame_url: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          role_type: string
          updated_at?: string | null
        }
        Update: {
          animation_type?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          frame_name?: string
          frame_url?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          role_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      room_welcome_messages: {
        Row: {
          background_color: string | null
          created_at: string | null
          display_order: number | null
          icon_emoji: string | null
          id: string
          is_active: boolean | null
          message: string
          room_type: string
          text_color: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          background_color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          message: string
          room_type: string
          text_color?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          background_color?: string | null
          created_at?: string | null
          display_order?: number | null
          icon_emoji?: string | null
          id?: string
          is_active?: boolean | null
          message?: string
          room_type?: string
          text_color?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      roulette_bets: {
        Row: {
          bet_amount: number
          bet_type: string
          created_at: string
          id: string
          is_winner: boolean | null
          multiplier: number
          payout: number | null
          session_id: string
          user_id: string
        }
        Insert: {
          bet_amount: number
          bet_type: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          multiplier: number
          payout?: number | null
          session_id: string
          user_id: string
        }
        Update: {
          bet_amount?: number
          bet_type?: string
          created_at?: string
          id?: string
          is_winner?: boolean | null
          multiplier?: number
          payout?: number | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roulette_bets_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "roulette_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roulette_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roulette_bets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      roulette_sessions: {
        Row: {
          betting_ends_at: string | null
          completed_at: string | null
          created_at: string
          id: string
          session_number: number
          status: string
          winning_number: number | null
        }
        Insert: {
          betting_ends_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          session_number?: number
          status?: string
          winning_number?: number | null
        }
        Update: {
          betting_ends_at?: string | null
          completed_at?: string | null
          created_at?: string
          id?: string
          session_number?: number
          status?: string
          winning_number?: number | null
        }
        Relationships: []
      }
      seat_invitations: {
        Row: {
          created_at: string
          expires_at: string | null
          host_id: string
          id: string
          invitee_id: string
          responded_at: string | null
          room_id: string
          seat_position: number | null
          status: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          host_id: string
          id?: string
          invitee_id: string
          responded_at?: string | null
          room_id: string
          seat_position?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          host_id?: string
          id?: string
          invitee_id?: string
          responded_at?: string | null
          room_id?: string
          seat_position?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_invitations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_invitations_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_invitations_invitee_id_fkey"
            columns: ["invitee_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_invitations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      seat_requests: {
        Row: {
          created_at: string
          id: string
          requester_id: string
          responded_at: string | null
          room_id: string
          seat_position: number
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          requester_id: string
          responded_at?: string | null
          room_id: string
          seat_position: number
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          requester_id?: string
          responded_at?: string | null
          room_id?: string
          seat_position?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "seat_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "seat_requests_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "party_rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string
          description: string
          device_info: Json | null
          id: string
          ip_address: string | null
          is_resolved: boolean | null
          metadata: Json | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string
          description: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string
          description?: string
          device_info?: Json | null
          id?: string
          ip_address?: string | null
          is_resolved?: boolean | null
          metadata?: Json | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "security_alerts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_log: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string | null
          severity: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
          severity?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string | null
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
          risk_level: string | null
          session_id: string | null
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
          risk_level?: string | null
          session_id?: string | null
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
          risk_level?: string | null
          session_id?: string | null
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
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          file_type: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          item_type: string
          min_level: number | null
          name: string
          preview_url: string | null
          price_diamonds: number
          rarity: string | null
          sound_duration_ms: number | null
          sound_url: string | null
          total_sold: number | null
          updated_at: string | null
        }
        Insert: {
          animation_file_url?: string | null
          animation_type?: string | null
          animation_url?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          item_type?: string
          min_level?: number | null
          name: string
          preview_url?: string | null
          price_diamonds?: number
          rarity?: string | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          total_sold?: number | null
          updated_at?: string | null
        }
        Update: {
          animation_file_url?: string | null
          animation_type?: string | null
          animation_url?: string | null
          category?: string
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          file_type?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          item_type?: string
          min_level?: number | null
          name?: string
          preview_url?: string | null
          price_diamonds?: number
          rarity?: string | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          total_sold?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          cast_members: string[] | null
          category: string
          content_type: string
          created_at: string
          description: string | null
          director: string | null
          display_order: number | null
          duration: string | null
          genre: string[] | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_premium: boolean | null
          maturity_rating: string | null
          original_language: string | null
          poster_url: string | null
          rating: string | null
          title: string
          trailer_url: string | null
          updated_at: string
          video_url: string | null
          year: number | null
        }
        Insert: {
          cast_members?: string[] | null
          category?: string
          content_type?: string
          created_at?: string
          description?: string | null
          director?: string | null
          display_order?: number | null
          duration?: string | null
          genre?: string[] | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          maturity_rating?: string | null
          original_language?: string | null
          poster_url?: string | null
          rating?: string | null
          title: string
          trailer_url?: string | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Update: {
          cast_members?: string[] | null
          category?: string
          content_type?: string
          created_at?: string
          description?: string | null
          director?: string | null
          display_order?: number | null
          duration?: string | null
          genre?: string[] | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_premium?: boolean | null
          maturity_rating?: string | null
          original_language?: string | null
          poster_url?: string | null
          rating?: string | null
          title?: string
          trailer_url?: string | null
          updated_at?: string
          video_url?: string | null
          year?: number | null
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          created_at: string
          description: string | null
          group_name: string | null
          id: string
          key: string
          type: string | null
          updated_at: string
          value: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_name?: string | null
          id?: string
          key: string
          type?: string | null
          updated_at?: string
          value?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          group_name?: string | null
          id?: string
          key?: string
          type?: string | null
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      sports: {
        Row: {
          created_at: string
          description: string | null
          event_type: string | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          is_live: boolean | null
          is_premium: boolean | null
          match_date: string | null
          slug: string
          sport_type: string | null
          stream_url: string | null
          team1: string | null
          team2: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_live?: boolean | null
          is_premium?: boolean | null
          match_date?: string | null
          slug: string
          sport_type?: string | null
          stream_url?: string | null
          team1?: string | null
          team2?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          event_type?: string | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          is_live?: boolean | null
          is_premium?: boolean | null
          match_date?: string | null
          slug?: string
          sport_type?: string | null
          stream_url?: string | null
          team1?: string | null
          team2?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      stream_chat: {
        Row: {
          content: string
          created_at: string | null
          id: string
          message_type: string | null
          sender_id: string
          stream_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          sender_id: string
          stream_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          message_type?: string | null
          sender_id?: string
          stream_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_chat_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_chat_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_chat_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
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
          {
            foreignKeyName: "stream_recordings_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
        ]
      }
      stream_viewers: {
        Row: {
          id: string
          joined_at: string | null
          left_at: string | null
          stream_id: string
          viewer_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          stream_id: string
          viewer_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          left_at?: string | null
          stream_id?: string
          viewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stream_viewers_stream_id_fkey"
            columns: ["stream_id"]
            isOneToOne: false
            referencedRelation: "live_streams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_viewers_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stream_viewers_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      sub_agent_commissions: {
        Row: {
          commission_amount: number
          commission_rate: number
          created_at: string | null
          gift_transaction_id: string | null
          host_id: string
          id: string
          sub_agent_id: string
        }
        Insert: {
          commission_amount: number
          commission_rate: number
          created_at?: string | null
          gift_transaction_id?: string | null
          host_id: string
          id?: string
          sub_agent_id: string
        }
        Update: {
          commission_amount?: number
          commission_rate?: number
          created_at?: string | null
          gift_transaction_id?: string | null
          host_id?: string
          id?: string
          sub_agent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sub_agent_commissions_gift_transaction_id_fkey"
            columns: ["gift_transaction_id"]
            isOneToOne: false
            referencedRelation: "gift_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agent_commissions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agent_commissions_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agent_commissions_sub_agent_id_fkey"
            columns: ["sub_agent_id"]
            isOneToOne: false
            referencedRelation: "sub_agents"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sub_agent_referrals_referred_host_id_fkey"
            columns: ["referred_host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agent_referrals_referred_host_id_fkey"
            columns: ["referred_host_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agent_referrals_sub_agent_id_fkey"
            columns: ["sub_agent_id"]
            isOneToOne: false
            referencedRelation: "sub_agents"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "sub_agents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agents_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agents_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agents_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sub_agents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "subscription_orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_orders_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
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
          ticket_id?: string
          translated_content?: string | null
          voice_transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
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
            foreignKeyName: "topup_helpers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "topup_helpers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      topup_payment_methods: {
        Row: {
          account_name: string
          account_number: string
          additional_info: Json | null
          bank_name: string | null
          country_codes: string[] | null
          created_at: string
          display_order: number | null
          icon_url: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          max_amount: number | null
          method_name: string
          method_type: string
          min_amount: number | null
          qr_code_url: string | null
          updated_at: string
        }
        Insert: {
          account_name: string
          account_number: string
          additional_info?: Json | null
          bank_name?: string | null
          country_codes?: string[] | null
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          max_amount?: number | null
          method_name: string
          method_type?: string
          min_amount?: number | null
          qr_code_url?: string | null
          updated_at?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          additional_info?: Json | null
          bank_name?: string | null
          country_codes?: string[] | null
          created_at?: string
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          max_amount?: number | null
          method_name?: string
          method_type?: string
          min_amount?: number | null
          qr_code_url?: string | null
          updated_at?: string
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
        Relationships: [
          {
            foreignKeyName: "trader_level_purchases_trader_id_fkey"
            columns: ["trader_id"]
            isOneToOne: false
            referencedRelation: "topup_helpers"
            referencedColumns: ["id"]
          },
        ]
      }
      trader_level_tiers: {
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
          upgrade_cost_usd: number
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
          upgrade_cost_usd?: number
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
          upgrade_cost_usd?: number
        }
        Relationships: []
      }
      user_beans_exchange_history: {
        Row: {
          beans_spent: number
          created_at: string
          diamonds_received: number
          id: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          beans_spent: number
          created_at?: string
          diamonds_received: number
          id?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          beans_spent?: number
          created_at?: string
          diamonds_received?: number
          id?: string
          tier_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_beans_exchange_history_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "user_beans_exchange_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_beans_exchange_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_beans_exchange_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_beans_exchange_tiers: {
        Row: {
          beans_amount: number
          created_at: string
          diamonds_reward: number
          display_order: number | null
          id: string
          is_active: boolean | null
          updated_at: string
        }
        Insert: {
          beans_amount: number
          created_at?: string
          diamonds_reward: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Update: {
          beans_amount?: number
          created_at?: string
          diamonds_reward?: number
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          reason: string | null
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          reason?: string | null
        }
        Relationships: []
      }
      user_entry_banners: {
        Row: {
          acquired_at: string
          acquired_type: string | null
          entry_banner_id: string
          expires_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          acquired_type?: string | null
          entry_banner_id: string
          expires_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          acquired_type?: string | null
          entry_banner_id?: string
          expires_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_entry_banners_entry_banner_id_fkey"
            columns: ["entry_banner_id"]
            isOneToOne: false
            referencedRelation: "entry_banners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entry_banners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_entry_banners_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          beans_earned: number | null
          coins_earned: number | null
          created_at: string | null
          id: string
          invitation_code: string
          invited_user_id: string
          inviter_id: string
          status: string | null
          verified_at: string | null
        }
        Insert: {
          beans_earned?: number | null
          coins_earned?: number | null
          created_at?: string | null
          id?: string
          invitation_code: string
          invited_user_id: string
          inviter_id: string
          status?: string | null
          verified_at?: string | null
        }
        Update: {
          beans_earned?: number | null
          coins_earned?: number | null
          created_at?: string | null
          id?: string
          invitation_code?: string
          invited_user_id?: string
          inviter_id?: string
          status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_level_thresholds: {
        Row: {
          badge_url: string | null
          created_at: string | null
          description: string | null
          diamonds_required: number
          id: string
          is_active: boolean | null
          level_name: string | null
          level_number: number
          updated_at: string | null
        }
        Insert: {
          badge_url?: string | null
          created_at?: string | null
          description?: string | null
          diamonds_required?: number
          id?: string
          is_active?: boolean | null
          level_name?: string | null
          level_number: number
          updated_at?: string | null
        }
        Update: {
          badge_url?: string | null
          created_at?: string | null
          description?: string | null
          diamonds_required?: number
          id?: string
          is_active?: boolean | null
          level_name?: string | null
          level_number?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      user_level_tiers: {
        Row: {
          animation_url: string | null
          bg_gradient: string | null
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level_color: string | null
          level_icon: string | null
          level_name: string
          level_number: number
          min_earning_amount: number
          min_topup_amount: number
          tier_type: string
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          bg_gradient?: string | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level_color?: string | null
          level_icon?: string | null
          level_name: string
          level_number: number
          min_earning_amount?: number
          min_topup_amount?: number
          tier_type?: string
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          bg_gradient?: string | null
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level_color?: string | null
          level_icon?: string | null
          level_name?: string
          level_number?: number
          min_earning_amount?: number
          min_topup_amount?: number
          tier_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      user_login_streaks: {
        Row: {
          created_at: string
          current_streak: number
          id: string
          last_login_date: string | null
          total_logins: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          total_logins?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_streak?: number
          id?: string
          last_login_date?: string | null
          total_logins?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_parcels: {
        Row: {
          actual_reward_amount: number | null
          actual_reward_type: string | null
          assigned_at: string | null
          created_at: string | null
          current_progress: number | null
          expires_at: string | null
          id: string
          opened_at: string | null
          required_progress: number | null
          status: string
          template_id: string
          unlocks_at: string | null
          user_id: string
        }
        Insert: {
          actual_reward_amount?: number | null
          actual_reward_type?: string | null
          assigned_at?: string | null
          created_at?: string | null
          current_progress?: number | null
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          required_progress?: number | null
          status?: string
          template_id: string
          unlocks_at?: string | null
          user_id: string
        }
        Update: {
          actual_reward_amount?: number | null
          actual_reward_type?: string | null
          assigned_at?: string | null
          created_at?: string | null
          current_progress?: number | null
          expires_at?: string | null
          id?: string
          opened_at?: string | null
          required_progress?: number | null
          status?: string
          template_id?: string
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
          id: string
          is_active: boolean
          price_paid: number
          purchased_at: string
          user_id: string
        }
        Insert: {
          background_id: string
          id?: string
          is_active?: boolean
          price_paid?: number
          purchased_at?: string
          user_id: string
        }
        Update: {
          background_id?: string
          id?: string
          is_active?: boolean
          price_paid?: number
          purchased_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purchased_backgrounds_background_id_fkey"
            columns: ["background_id"]
            isOneToOne: false
            referencedRelation: "party_room_backgrounds"
            referencedColumns: ["id"]
          },
        ]
      }
      user_purchases: {
        Row: {
          expires_at: string | null
          id: string
          is_active: boolean | null
          is_equipped: boolean | null
          item_id: string
          price_paid: number
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_equipped?: boolean | null
          item_id: string
          price_paid: number
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          is_equipped?: boolean | null
          item_id?: string
          price_paid?: number
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_purchases_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "shop_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          action_taken: string | null
          admin_notes: string | null
          context_id: string | null
          context_type: string | null
          created_at: string
          description: string | null
          id: string
          report_category: string
          reported_user_id: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          admin_notes?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          report_category: string
          reported_user_id: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          admin_notes?: string | null
          context_id?: string | null
          context_type?: string | null
          created_at?: string
          description?: string | null
          id?: string
          report_category?: string
          reported_user_id?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
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
          {
            foreignKeyName: "user_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_role_frames: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          frame_id: string
          id: string
          is_equipped: boolean | null
          notes: string | null
          role_type: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          frame_id: string
          id?: string
          is_equipped?: boolean | null
          notes?: string | null
          role_type: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          frame_id?: string
          id?: string
          is_equipped?: boolean | null
          notes?: string | null
          role_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_frames_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_role_frames_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
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
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          order_id: string | null
          plan_id: string | null
          plan_name: string
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          order_id?: string | null
          plan_id?: string | null
          plan_name: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          order_id?: string | null
          plan_id?: string | null
          plan_name?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "subscription_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_task_progress: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string | null
          current_progress: number | null
          id: string
          is_claimed: boolean | null
          is_completed: boolean | null
          reset_date: string | null
          task_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_progress?: number | null
          id?: string
          is_claimed?: boolean | null
          is_completed?: boolean | null
          reset_date?: string | null
          task_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string | null
          current_progress?: number | null
          id?: string
          is_claimed?: boolean | null
          is_completed?: boolean | null
          reset_date?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_task_progress_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "daily_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_task_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_vip_subscriptions: {
        Row: {
          auto_renew: boolean | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          started_at: string | null
          tier_id: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          tier_id: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          started_at?: string | null
          tier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_vip_subscriptions_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_vip_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_vip_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      violation_penalty_tiers: {
        Row: {
          beans_amount: number
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          penalty_type: string
          updated_at: string | null
          violation_number: number
        }
        Insert: {
          beans_amount?: number
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          penalty_type?: string
          updated_at?: string | null
          violation_number: number
        }
        Update: {
          beans_amount?: number
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
      vip_exclusive_items: {
        Row: {
          animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          item_type: string
          name: string
          preview_url: string | null
          updated_at: string | null
          vip_tier_id: string
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          item_type?: string
          name: string
          preview_url?: string | null
          updated_at?: string | null
          vip_tier_id: string
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          item_type?: string
          name?: string
          preview_url?: string | null
          updated_at?: string | null
          vip_tier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vip_exclusive_items_vip_tier_id_fkey"
            columns: ["vip_tier_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      vip_tiers: {
        Row: {
          ad_free: boolean | null
          badge_animation_url: string | null
          badge_color: string | null
          badge_url: string | null
          bubble_animation_url: string | null
          created_at: string | null
          description: string | null
          display_order: number | null
          duration_days: number | null
          entry_animation_url: string | null
          exclusive_bubbles: boolean | null
          exclusive_entry_bars: boolean | null
          exclusive_frames: boolean | null
          exclusive_gifts: boolean | null
          exclusive_stickers: boolean | null
          faster_support: boolean | null
          frame_animation_url: string | null
          id: string
          is_active: boolean | null
          price_diamonds: number
          priority_matching: boolean | null
          profile_highlight: boolean | null
          tier_code: string
          tier_level: number
          tier_name: string
          updated_at: string | null
          vip_only_rooms: boolean | null
        }
        Insert: {
          ad_free?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          bubble_animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entry_animation_url?: string | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          frame_animation_url?: string | null
          id?: string
          is_active?: boolean | null
          price_diamonds?: number
          priority_matching?: boolean | null
          profile_highlight?: boolean | null
          tier_code: string
          tier_level?: number
          tier_name: string
          updated_at?: string | null
          vip_only_rooms?: boolean | null
        }
        Update: {
          ad_free?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          bubble_animation_url?: string | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entry_animation_url?: string | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          frame_animation_url?: string | null
          id?: string
          is_active?: boolean | null
          price_diamonds?: number
          priority_matching?: boolean | null
          profile_highlight?: boolean | null
          tier_code?: string
          tier_level?: number
          tier_name?: string
          updated_at?: string | null
          vip_only_rooms?: boolean | null
        }
        Relationships: []
      }
      vpn_detection_logs: {
        Row: {
          city: string | null
          country_code: string | null
          created_at: string
          detection_source: string | null
          id: string
          ip_address: string
          is_proxy: boolean | null
          is_relay: boolean | null
          is_tor: boolean | null
          is_vpn: boolean | null
          isp: string | null
          raw_response: Json | null
          user_id: string | null
        }
        Insert: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          detection_source?: string | null
          id?: string
          ip_address: string
          is_proxy?: boolean | null
          is_relay?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          isp?: string | null
          raw_response?: Json | null
          user_id?: string | null
        }
        Update: {
          city?: string | null
          country_code?: string | null
          created_at?: string
          detection_source?: string | null
          id?: string
          ip_address?: string
          is_proxy?: boolean | null
          is_relay?: boolean | null
          is_tor?: boolean | null
          is_vpn?: boolean | null
          isp?: string | null
          raw_response?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vpn_detection_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vpn_detection_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          content_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          content_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          content_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "site_content"
            referencedColumns: ["id"]
          },
        ]
      }
      welcome_bonuses: {
        Row: {
          bonus_coins: number
          granted_at: string
          id: string
          user_id: string
        }
        Insert: {
          bonus_coins?: number
          granted_at?: string
          id?: string
          user_id: string
        }
        Update: {
          bonus_coins?: number
          granted_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_sources: {
        Row: {
          category: string | null
          channel_id: string | null
          channel_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          last_fetched_at: string | null
          logo_url: string | null
          name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          channel_id?: string | null
          channel_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          logo_url?: string | null
          name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          channel_id?: string | null
          channel_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_fetched_at?: string | null
          logo_url?: string | null
          name?: string
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
          id: string | null
          is_active: boolean | null
          level: string | null
          logo_url: string | null
          name: string | null
          owner_id: string | null
          total_agents: number | null
          total_hosts: number | null
        }
        Insert: {
          agency_code?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          level?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          total_agents?: number | null
          total_hosts?: number | null
        }
        Update: {
          agency_code?: string | null
          created_at?: string | null
          id?: string | null
          is_active?: boolean | null
          level?: string | null
          logo_url?: string | null
          name?: string | null
          owner_id?: string | null
          total_agents?: number | null
          total_hosts?: number | null
        }
        Relationships: []
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
      profiles_public: {
        Row: {
          age: number | null
          app_uid: string | null
          avatar_url: string | null
          bio: string | null
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
          frame_id: string | null
          gender: string | null
          hide_location: boolean | null
          host_level: number | null
          id: string | null
          is_blocked: boolean | null
          is_face_verified: boolean | null
          is_host: boolean | null
          is_in_call: boolean | null
          is_online: boolean | null
          is_verified: boolean | null
          last_seen_at: string | null
          previous_host_level: number | null
          region: string | null
          tags: string[] | null
          user_level: number | null
          username: string | null
          vip_expires_at: string | null
        }
        Insert: {
          age?: number | null
          app_uid?: string | null
          avatar_url?: string | null
          bio?: string | null
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
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean | null
          host_level?: number | null
          id?: string | null
          is_blocked?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen_at?: string | null
          previous_host_level?: number | null
          region?: string | null
          tags?: string[] | null
          user_level?: number | null
          username?: string | null
          vip_expires_at?: string | null
        }
        Update: {
          age?: number | null
          app_uid?: string | null
          avatar_url?: string | null
          bio?: string | null
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
          frame_id?: string | null
          gender?: string | null
          hide_location?: boolean | null
          host_level?: number | null
          id?: string | null
          is_blocked?: boolean | null
          is_face_verified?: boolean | null
          is_host?: boolean | null
          is_in_call?: boolean | null
          is_online?: boolean | null
          is_verified?: boolean | null
          last_seen_at?: string | null
          previous_host_level?: number | null
          region?: string | null
          tags?: string[] | null
          user_level?: number | null
          username?: string | null
          vip_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_current_vip_tier_id_fkey"
            columns: ["current_vip_tier_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_frame_id_fkey"
            columns: ["frame_id"]
            isOneToOne: false
            referencedRelation: "avatar_frames"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
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
        Returns: undefined
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
        Returns: undefined
      }
      add_to_helper_wallet: {
        Args: { _amount: number; _helper_id: string }
        Returns: undefined
      }
      admin_add_agency_coins: {
        Args: { _agency_id: string; _amount: number; _note?: string }
        Returns: boolean
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
      admin_approve_helper: { Args: { _helper_id: string }; Returns: boolean }
      admin_block_agency: {
        Args: { _agency_id: string; _block: boolean; _reason?: string }
        Returns: boolean
      }
      admin_block_user:
        | {
            Args: { _block: boolean; _reason?: string; _user_id: string }
            Returns: boolean
          }
        | {
            Args: {
              _ban_device?: boolean
              _block: boolean
              _reason?: string
              _user_id: string
            }
            Returns: boolean
          }
      admin_change_user_role: {
        Args: { _new_role: string; _user_id: string }
        Returns: boolean
      }
      admin_clear_frame_references: {
        Args: { frame_id_to_clear: string }
        Returns: undefined
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
      admin_delete_user: { Args: { _user_id: string }; Returns: boolean }
      admin_get_user_full_details: { Args: { _user_id: string }; Returns: Json }
      admin_process_face_verification: {
        Args: {
          _action: string
          _approve_as?: string
          _reason?: string
          _set_gender?: string
          _submission_id: string
        }
        Returns: boolean
      }
      admin_process_helper_transaction: {
        Args: { _action: string; _transaction_id: string }
        Returns: boolean
      }
      admin_process_withdrawal: {
        Args: { _notes?: string; _status: string; _withdrawal_id: string }
        Returns: Json
      }
      admin_remove_face_verification: {
        Args: { _user_id: string }
        Returns: boolean
      }
      admin_remove_host_from_agency: {
        Args: { _host_id: string; _reason?: string }
        Returns: boolean
      }
      admin_toggle_face_verification: {
        Args: { _user_id: string; _verified: boolean }
        Returns: boolean
      }
      admin_update_agency_level: {
        Args: { _agency_id: string; _level: string }
        Returns: boolean
      }
      admin_update_user_gender: {
        Args: { _new_gender: string; _user_id: string }
        Returns: boolean
      }
      agency_send_diamonds_to_agency: {
        Args: {
          _amount: number
          _sender_agency_id: string
          _target_agency_id: string
        }
        Returns: Json
      }
      agency_send_diamonds_to_user: {
        Args: { _agency_id: string; _amount: number; _receiver_id: string }
        Returns: Json
      }
      apply_as_topup_helper: { Args: { _contact_info?: Json }; Returns: string }
      approve_host_request: {
        Args: { _agency_id: string; _approver_id: string; _host_id: string }
        Returns: boolean
      }
      approve_rating_reward: {
        Args: { p_admin_id: string; p_claim_id: string }
        Returns: Json
      }
      assign_payroll_to_trader: { Args: { _request_id: string }; Returns: Json }
      auto_distribute_leaderboard_rewards: { Args: never; Returns: string }
      auto_distribute_pk_rewards: { Args: never; Returns: string }
      auto_finalize_face_verification: {
        Args: {
          _admin_notes?: string
          _avatar_url?: string
          _detected_gender: string
          _display_name?: string
          _host_photos?: string[]
          _submission_id: string
        }
        Returns: Json
      }
      auto_process_live_game: { Args: never; Returns: Json }
      auto_verify_gift_transactions: { Args: never; Returns: Json }
      ban_duplicate_face_attempt: {
        Args: {
          _duplicate_uid?: string
          _duplicate_user_id: string
          _user_id: string
        }
        Returns: Json
      }
      bulk_credit_call_earnings: {
        Args: { _admin_id: string; _call_ids: string[] }
        Returns: Json
      }
      calculate_commission: {
        Args: { p_amount: number; p_rate?: number }
        Returns: number
      }
      calculate_user_level: {
        Args: { _total_consumption: number }
        Returns: number
      }
      can_access_agency: {
        Args: { p_agency_id: string; p_user_id: string }
        Returns: boolean
      }
      can_access_party_room: {
        Args: { p_room_id: string; p_user_id: string }
        Returns: boolean
      }
      cancel_account_deletion: {
        Args: { user_id_param: string }
        Returns: boolean
      }
      cancel_agency_request: { Args: { _host_id: string }; Returns: boolean }
      check_agency_host_compliance: { Args: never; Returns: undefined }
      check_agency_minimum_hosts: { Args: never; Returns: undefined }
      check_ban_on_login: { Args: { p_user_id: string }; Returns: Json }
      check_brute_force: {
        Args: {
          p_identifier: string
          p_ip_address?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      check_group_membership: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: boolean
      }
      check_otp_rate_limit: { Args: { p_email: string }; Returns: boolean }
      check_rate_limit:
        | {
            Args: { _action: string; _max_per_hour?: number; _user_id: string }
            Returns: boolean
          }
        | {
            Args: {
              p_action_type: string
              p_identifier: string
              p_max_requests?: number
              p_window_seconds?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_endpoint: string
              p_max_requests?: number
              p_user_id: string
              p_window_seconds?: number
            }
            Returns: boolean
          }
      check_session_valid: {
        Args: { p_session_id: string; p_user_id: string }
        Returns: boolean
      }
      check_user_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      claim_daily_login_reward: { Args: never; Returns: Json }
      claim_invitation_reward: {
        Args: {
          p_invite_count: number
          p_reward_beans: number
          p_reward_coins: number
          p_tier_id: string
        }
        Returns: Json
      }
      claim_new_host_live_bonus: {
        Args: { p_hours?: number; p_user_id: string }
        Returns: Json
      }
      claim_parcel_reward: { Args: { p_parcel_id: string }; Returns: Json }
      claim_task_reward: { Args: { _task_id: string }; Returns: Json }
      cleanup_application_logs: {
        Args: never
        Returns: {
          session_security_logs_deleted: number
          system_error_logs_deleted: number
        }[]
      }
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
      create_guest_profile: {
        Args: { p_display_name: string; p_gender: string; p_user_id: string }
        Returns: boolean
      }
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
        Args: {
          p_betting_seconds?: number
          p_game_id: string
          p_room_id?: string
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_data?: Json
          p_message: string
          p_title: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      create_sub_agent: {
        Args: { _agency_id: string; _referrer_id?: string; _user_id: string }
        Returns: string
      }
      current_user_id: { Args: never; Returns: string }
      debug_distribute_test: {
        Args: { p_category: string; p_period_type: string }
        Returns: {
          detail: string
          step: string
        }[]
      }
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
      deduct_coins_atomic: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      deduct_coins_from_user: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      deduct_helper_wallet: {
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
      end_private_call: {
        Args: { _call_id: string; _end_reason?: string }
        Returns: boolean
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
      exchange_user_beans_to_diamonds:
        | {
            Args: {
              _beans_amount: number
              _diamonds_reward: number
              _tier_id?: string
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _beans_amount: number
              _diamonds_reward: number
              _tier_id?: string
              _user_id: string
            }
            Returns: boolean
          }
      finalize_first_minute_earnings: {
        Args: { p_call_id: string }
        Returns: Json
      }
      find_account_by_face: {
        Args: { face_hash_param: string }
        Returns: {
          app_uid: string
          avatar_url: string
          deletion_scheduled_at: string
          display_name: string
          is_blocked: boolean
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
      generate_app_uid: { Args: never; Returns: string }
      generate_sub_agent_referral_code: { Args: never; Returns: string }
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
      get_admin_analytics_chart_data: {
        Args: { p_days?: number }
        Returns: Json
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
      get_agency_sub_agents_count: {
        Args: { agency_uuid: string }
        Returns: number
      }
      get_agency_total_network: { Args: { agency_uuid: string }; Returns: Json }
      get_agency_transfer_history: {
        Args: { _limit?: number }
        Returns: {
          amount: number
          created_at: string
          id: string
          note: string
          receiver_avatar: string
          receiver_id: string
          receiver_name: string
          status: string
        }[]
      }
      get_call_host_commission_percent: { Args: never; Returns: number }
      get_conversations_with_details: {
        Args: { p_user_id: string }
        Returns: Json
      }
      get_effective_host_percent: { Args: never; Returns: number }
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
          agency_level: string
          agency_logo_url: string
          agency_name: string
          requested_at: string
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
      get_level_frame: {
        Args: { p_level: number; p_target_type?: string }
        Returns: {
          animation_type: string
          frame_type: string
          frame_url: string
          id: string
          min_level: number
          name: string
        }[]
      }
      get_payment_reconciliation_report: {
        Args: { p_days?: number }
        Returns: Json
      }
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
      get_user_balance: { Args: never; Returns: Json }
      get_user_beans: { Args: { p_user_id: string }; Returns: number }
      get_user_coins: { Args: { p_user_id: string }; Returns: number }
      get_user_level: { Args: { p_user_id: string }; Returns: number }
      get_user_live_ban: {
        Args: { p_user_id: string }
        Returns: {
          ban_end: string
          ban_id: string
          ban_reason: string
          remaining_hours: number
        }[]
      }
      get_user_notices: {
        Args: { p_user_id: string }
        Returns: {
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
        }[]
        SetofOptions: {
          from: "*"
          to: "admin_notices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      handle_suspicious_activity: {
        Args: { p_activity_type: string; p_details?: Json; p_user_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_section_access: {
        Args: { _section_key: string; _user_id: string }
        Returns: boolean
      }
      helper_add_coins_to_user: {
        Args: { _amount: number; _user_id: string }
        Returns: Json
      }
      helper_add_diamonds_to_agency: {
        Args: { _agency_id: string; _amount: number }
        Returns: Json
      }
      helper_buy_coins: {
        Args: {
          _amount: number
          _payment_details?: Json
          _payment_method: string
        }
        Returns: string
      }
      helper_process_order: {
        Args: { _action: string; _notes?: string; _order_id: string }
        Returns: boolean
      }
      helper_transfer_coins: {
        Args: { _coin_amount: number; _notes?: string; _user_app_uid: string }
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
      increment_agency_agents: {
        Args: { agency_uuid: string }
        Returns: undefined
      }
      increment_reel_view: { Args: { reel_uuid: string }; Returns: undefined }
      increment_view_count: {
        Args: { p_id: string; p_table: string }
        Returns: undefined
      }
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_admin_device_approved: {
        Args: { _device_fingerprint: string; _user_id: string }
        Returns: boolean
      }
      is_admin_owner: { Args: { _user_id: string }; Returns: boolean }
      is_agency_host: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_agency_owner: {
        Args: { _agency_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_ip_blocked: { Args: { p_ip: unknown }; Returns: boolean }
      is_moderator: { Args: never; Returns: boolean }
      is_parent_agency_owner: {
        Args: { _agency_parent_id: string; _user_id: string }
        Returns: boolean
      }
      is_real_user: { Args: never; Returns: boolean }
      is_stream_owner: {
        Args: { p_stream_id: string; p_user_id: string }
        Returns: boolean
      }
      is_user_live_banned: { Args: { p_user_id: string }; Returns: boolean }
      join_agency: {
        Args: { _agency_code: string; _host_id: string; _joined_via?: string }
        Returns: boolean
      }
      log_admin_action:
        | {
            Args: {
              _action_type: string
              _details?: Json
              _target_id?: string
              _target_type?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _action_type: string
              _details?: Json
              _target_id: string
              _target_type: string
            }
            Returns: undefined
          }
      log_phone_number_violation: {
        Args: {
          _context_type?: string
          _detected_content: string
          _user_id: string
        }
        Returns: Json
      }
      log_security_event: {
        Args: {
          p_action: string
          p_details?: Json
          p_resource_id?: string
          p_resource_type?: string
          p_severity?: string
        }
        Returns: string
      }
      manual_credit_call_earnings: {
        Args: { _admin_id: string; _call_id: string; _notes?: string }
        Returns: Json
      }
      mark_messages_delivered: {
        Args: { p_conversation_id: string; p_recipient_id: string }
        Returns: number
      }
      mark_messages_read_batch: {
        Args: { p_conversation_id: string; p_recipient_id: string }
        Returns: number
      }
      notify_admin_users: {
        Args: {
          p_data?: Json
          p_message: string
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      place_game_bet: {
        Args: {
          p_amount: number
          p_game_id: string
          p_game_name: string
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
      process_face_verification_auto: {
        Args: { _detected_gender?: string; _submission_id: string }
        Returns: string
      }
      process_game_bet:
        | {
            Args: {
              p_bet_amount: number
              p_bet_type?: string
              p_bet_value?: string
              p_game_id: string
              p_user_id: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_bet_amount: number
              p_bet_details?: Json
              p_game_key: string
              p_room_id: string
              p_user_id: string
            }
            Returns: Json
          }
      process_game_win: {
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
      process_gift_transaction: {
        Args: {
          p_call_id?: string
          p_gift_id: string
          p_party_room_id?: string
          p_quantity: number
          p_receiver_id: string
          p_sender_id: string
          p_stream_id?: string
        }
        Returns: Json
      }
      process_live_game_round: {
        Args: { p_result?: Json; p_round_id: string; p_winning_value: string }
        Returns: Json
      }
      process_weekly_agency_transfers: { Args: never; Returns: Json }
      raise_security_alert: {
        Args: {
          p_alert_type: string
          p_description: string
          p_device_info?: Json
          p_ip_address?: string
          p_metadata?: Json
          p_severity: string
        }
        Returns: string
      }
      recalculate_all_agency_levels: { Args: never; Returns: Json }
      recalculate_all_user_levels: { Args: never; Returns: undefined }
      recalculate_single_user_level: {
        Args: { _user_id: string }
        Returns: undefined
      }
      recalculate_user_level: { Args: { _user_id: string }; Returns: number }
      record_live_violation: {
        Args: {
          p_auto_detected?: boolean
          p_stream_id: string
          p_user_id: string
          p_violation_type: string
        }
        Returns: Json
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
      register_admin_device: {
        Args: {
          _device_fingerprint: string
          _device_info?: Json
          _device_name?: string
          _ip_address?: string
          _user_agent?: string
        }
        Returns: string
      }
      reject_host_request: {
        Args: {
          _agency_id: string
          _host_id: string
          _rejection_reason?: string
          _rejector_id: string
        }
        Returns: boolean
      }
      request_account_deletion: {
        Args: { user_id_param: string }
        Returns: boolean
      }
      request_agency_withdrawal: {
        Args: {
          _agency_id: string
          _amount: number
          _payment_details: Json
          _payment_method: string
        }
        Returns: Json
      }
      reset_host_levels_weekly: { Args: never; Returns: undefined }
      reset_host_total_earnings: {
        Args: { p_host_id: string }
        Returns: undefined
      }
      reset_my_call_status: { Args: never; Returns: undefined }
      reset_weekly_contact_violations: { Args: never; Returns: undefined }
      restore_expired_items: { Args: never; Returns: undefined }
      roulette_complete_session: {
        Args: { p_session_id: string }
        Returns: Json
      }
      roulette_get_or_create_session: {
        Args: { p_duration_seconds?: number }
        Returns: Json
      }
      roulette_spin_wheel: { Args: { p_session_id: string }; Returns: Json }
      safe_credit_diamonds: {
        Args: {
          p_amount: number
          p_amount_usd?: number
          p_gateway: string
          p_metadata?: Json
          p_order_id: string
          p_transaction_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      sanitize_input: { Args: { p_input: string }; Returns: string }
      search_group_by_code: {
        Args: { _group_code: string }
        Returns: {
          avatar_url: string
          group_type: string
          id: string
          member_count: number
          name: string
          owner_avatar: string
          owner_name: string
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
          username: string
        }[]
      }
      search_user_by_id: {
        Args: { _search_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          is_host: boolean
          is_verified: boolean
          username: string
        }[]
      }
      service_add_beans: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      service_add_diamonds: {
        Args: { p_amount: number; p_user_id: string }
        Returns: undefined
      }
      start_private_call:
        | {
            Args: { _caller_id: string; _host_id: string; _stream_id?: string }
            Returns: Json
          }
        | { Args: { _host_id: string; _stream_id?: string }; Returns: string }
        | {
            Args: {
              p_call_type?: string
              p_caller_id: string
              p_receiver_id: string
            }
            Returns: Json
          }
      timeout_private_call: { Args: { _call_id: string }; Returns: boolean }
      transfer_beans: {
        Args: { p_amount: number; p_from_user: string; p_to_user: string }
        Returns: boolean
      }
      transfer_coins: {
        Args: { p_amount: number; p_receiver_id: string; p_sender_id: string }
        Returns: undefined
      }
      transfer_coins_to_user: {
        Args: { _amount: number; _note?: string; _receiver_id: string }
        Returns: string
      }
      update_active_session: {
        Args: {
          p_device_info?: string
          p_session_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      update_admin_device_status: {
        Args: {
          _device_id: string
          _new_status: Database["public"]["Enums"]["admin_device_status"]
          _notes?: string
        }
        Returns: boolean
      }
      update_host_earnings_only: {
        Args: {
          p_beans_to_add: number
          p_host_id: string
          p_new_host_level: number
          p_new_total_earnings: number
        }
        Returns: Json
      }
      update_online_status: {
        Args: {
          p_is_online: boolean
          p_last_seen_at?: string
          p_user_id: string
        }
        Returns: undefined
      }
      update_stream_heartbeat: {
        Args: { stream_id: string }
        Returns: undefined
      }
      update_task_progress: {
        Args: { _increment?: number; _task_type: string; _value?: number }
        Returns: Json
      }
      upsert_user_task_progress: {
        Args: {
          p_is_claimed?: boolean
          p_is_completed?: boolean
          p_progress?: number
          p_reset_date: string
          p_task_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      validate_input: {
        Args: { p_input: string; p_type: string }
        Returns: boolean
      }
      validate_session_integrity: {
        Args: {
          p_device_fingerprint: string
          p_ip_address: string
          p_user_agent: string
          p_user_id: string
        }
        Returns: Json
      }
      verify_session: { Args: never; Returns: boolean }
    }
    Enums: {
      admin_device_status: "pending" | "approved" | "blocked"
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
      admin_device_status: ["pending", "approved", "blocked"],
      admin_role: ["owner", "sub_admin"],
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
