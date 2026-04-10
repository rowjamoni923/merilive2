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
        Relationships: []
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
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      agency_withdrawals: {
        Row: {
          agency_id: string
          amount: number
          exchange_rate: number | null
          id: string
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
          agency_id: string
          amount: number
          exchange_rate?: number | null
          id?: string
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
          agency_id?: string
          amount?: number
          exchange_rate?: number | null
          id?: string
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
        Relationships: []
      }
      allowed_external_links: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          label: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          label?: string | null
          url?: string
        }
        Relationships: []
      }
      app_content: {
        Row: {
          content: string
          created_at: string | null
          display_order: number | null
          id: string
          is_published: boolean | null
          language: string | null
          title: string
          type: string
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          language?: string | null
          title: string
          type: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_published?: boolean | null
          language?: string | null
          title?: string
          type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_event_themes: {
        Row: {
          color_scheme: Json | null
          created_at: string | null
          end_date: string | null
          event_type: string
          home_banner_url: string | null
          icon_set: Json | null
          id: string
          is_active: boolean | null
          login_bg_url: string | null
          splash_image_url: string | null
          start_date: string | null
          theme_name: string
          updated_at: string | null
        }
        Insert: {
          color_scheme?: Json | null
          created_at?: string | null
          end_date?: string | null
          event_type: string
          home_banner_url?: string | null
          icon_set?: Json | null
          id?: string
          is_active?: boolean | null
          login_bg_url?: string | null
          splash_image_url?: string | null
          start_date?: string | null
          theme_name: string
          updated_at?: string | null
        }
        Update: {
          color_scheme?: Json | null
          created_at?: string | null
          end_date?: string | null
          event_type?: string
          home_banner_url?: string | null
          icon_set?: Json | null
          id?: string
          is_active?: boolean | null
          login_bg_url?: string | null
          splash_image_url?: string | null
          start_date?: string | null
          theme_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      app_icon_registry: {
        Row: {
          category: string | null
          created_at: string | null
          current_url: string | null
          default_url: string | null
          description: string | null
          display_order: number | null
          icon_key: string
          icon_label: string
          id: string
          is_active: boolean | null
          platform: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          current_url?: string | null
          default_url?: string | null
          description?: string | null
          display_order?: number | null
          icon_key: string
          icon_label: string
          id?: string
          is_active?: boolean | null
          platform?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          current_url?: string | null
          default_url?: string | null
          description?: string | null
          display_order?: number | null
          icon_key?: string
          icon_label?: string
          id?: string
          is_active?: boolean | null
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
          force_update: boolean | null
          id: string
          is_maintenance: boolean | null
          maintenance_end_time: string | null
          maintenance_message: string | null
          minimum_version: string
          platform: string
          update_url: string | null
          updated_at: string | null
        }
        Insert: {
          changelog?: string | null
          created_at?: string | null
          current_version: string
          force_update?: boolean | null
          id?: string
          is_maintenance?: boolean | null
          maintenance_end_time?: string | null
          maintenance_message?: string | null
          minimum_version: string
          platform: string
          update_url?: string | null
          updated_at?: string | null
        }
        Update: {
          changelog?: string | null
          created_at?: string | null
          current_version?: string
          force_update?: boolean | null
          id?: string
          is_maintenance?: boolean | null
          maintenance_end_time?: string | null
          maintenance_message?: string | null
          minimum_version?: string
          platform?: string
          update_url?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      ar_stickers: {
        Row: {
          category: string | null
          coin_price: number | null
          created_at: string | null
          display_order: number | null
          file_url: string
          id: string
          is_active: boolean | null
          is_free: boolean | null
          name: string
          preview_url: string | null
        }
        Insert: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          display_order?: number | null
          file_url: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name: string
          preview_url?: string | null
        }
        Update: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          display_order?: number | null
          file_url?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string
          preview_url?: string | null
        }
        Relationships: []
      }
      avatar_frames: {
        Row: {
          animation_url: string | null
          category: string | null
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          is_premium: boolean | null
          level_required: number | null
          name: string
          price_coins: number | null
          price_diamonds: number | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name: string
          price_coins?: number | null
          price_diamonds?: number | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_free?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name?: string
          price_coins?: number | null
          price_diamonds?: number | null
          updated_at?: string | null
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
          user_id: string | null
        }
        Insert: {
          banned_at?: string
          banned_by?: string | null
          device_id: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          user_id?: string | null
        }
        Update: {
          banned_at?: string
          banned_by?: string | null
          device_id?: string
          id?: string
          is_active?: boolean | null
          reason?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      banners: {
        Row: {
          banner_type: string | null
          click_action: string | null
          created_at: string | null
          display_order: number | null
          end_date: string | null
          id: string
          image_url: string
          is_active: boolean | null
          link_url: string | null
          location: string | null
          start_date: string | null
          target_data: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          banner_type?: string | null
          click_action?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url: string
          is_active?: boolean | null
          link_url?: string | null
          location?: string | null
          start_date?: string | null
          target_data?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          banner_type?: string | null
          click_action?: string | null
          created_at?: string | null
          display_order?: number | null
          end_date?: string | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          link_url?: string | null
          location?: string | null
          start_date?: string | null
          target_data?: Json | null
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
          display_order: number | null
          file_url: string
          filter_type: string | null
          id: string
          intensity_default: number | null
          is_active: boolean | null
          is_free: boolean | null
          name: string
          preview_url: string | null
        }
        Insert: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          display_order?: number | null
          file_url: string
          filter_type?: string | null
          id?: string
          intensity_default?: number | null
          is_active?: boolean | null
          is_free?: boolean | null
          name: string
          preview_url?: string | null
        }
        Update: {
          category?: string | null
          coin_price?: number | null
          created_at?: string | null
          display_order?: number | null
          file_url?: string
          filter_type?: string | null
          id?: string
          intensity_default?: number | null
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string
          preview_url?: string | null
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
          reason: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address: string
          is_active?: boolean | null
          reason?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          expires_at?: string | null
          id?: string
          ip_address?: string
          is_active?: boolean | null
          reason?: string | null
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
      call_events: {
        Row: {
          call_type: string | null
          caller_id: string
          coin_cost: number | null
          duration: number | null
          ended_at: string | null
          id: string
          receiver_id: string
          started_at: string | null
          status: string | null
        }
        Insert: {
          call_type?: string | null
          caller_id: string
          coin_cost?: number | null
          duration?: number | null
          ended_at?: string | null
          id?: string
          receiver_id: string
          started_at?: string | null
          status?: string | null
        }
        Update: {
          call_type?: string | null
          caller_id?: string
          coin_cost?: number | null
          duration?: number | null
          ended_at?: string | null
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
      chat_moderation_logs: {
        Row: {
          action_taken: string
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
      coin_transfers: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          notes: string | null
          receiver_id: string
          sender_id: string
          transfer_type: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          notes?: string | null
          receiver_id: string
          sender_id: string
          transfer_type?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          notes?: string | null
          receiver_id?: string
          sender_id?: string
          transfer_type?: string | null
        }
        Relationships: []
      }
      consumption_return_config: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          max_consumption: number | null
          min_consumption: number
          return_percentage: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_consumption?: number | null
          min_consumption?: number
          return_percentage?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          max_consumption?: number | null
          min_consumption?: number
          return_percentage?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      consumption_return_history: {
        Row: {
          consumption_amount: number
          created_at: string | null
          id: string
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
          country_flag: string | null
          country_name: string | null
          created_at: string | null
          currency_code: string
          id: string
          is_active: boolean | null
          rate_to_usd: number
          updated_at: string | null
        }
        Insert: {
          country_flag?: string | null
          country_name?: string | null
          created_at?: string | null
          currency_code: string
          id?: string
          is_active?: boolean | null
          rate_to_usd: number
          updated_at?: string | null
        }
        Update: {
          country_flag?: string | null
          country_name?: string | null
          created_at?: string | null
          currency_code?: string
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
          day_number: number
          id: string
          reward_amount: number
          reward_id: string
          reward_type: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          day_number: number
          id?: string
          reward_amount: number
          reward_id: string
          reward_type: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
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
          created_at: string | null
          day_number: number
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          reward_amount: number
          reward_type: string
        }
        Insert: {
          created_at?: string | null
          day_number: number
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          reward_amount: number
          reward_type: string
        }
        Update: {
          created_at?: string | null
          day_number?: number
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          reward_amount?: number
          reward_type?: string
        }
        Relationships: []
      }
      daily_tasks: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          icon_name: string | null
          id: string
          is_active: boolean | null
          min_level: number | null
          required_count: number | null
          reward_coins: number | null
          reward_xp: number | null
          target_gender: string | null
          task_type: string
          title: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          required_count?: number | null
          reward_coins?: number | null
          reward_xp?: number | null
          target_gender?: string | null
          task_type: string
          title: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_name?: string | null
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          required_count?: number | null
          reward_coins?: number | null
          reward_xp?: number | null
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
      entry_name_bars: {
        Row: {
          animation_url: string | null
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_premium: boolean | null
          level_required: number | null
          name: string
          price_coins: number | null
          price_diamonds: number | null
          updated_at: string | null
        }
        Insert: {
          animation_url?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name: string
          price_coins?: number | null
          price_diamonds?: number | null
          updated_at?: string | null
        }
        Update: {
          animation_url?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          level_required?: number | null
          name?: string
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
          ai_analysis: Json | null
          confidence_score: number | null
          created_at: string | null
          id: string
          notes: string | null
          reference_image_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          selfie_url: string
          status: string | null
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          reference_image_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url: string
          status?: string | null
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          reference_image_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          selfie_url?: string
          status?: string | null
          user_id?: string
        }
        Relationships: []
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
          bonus_coins: number
          bonus_percentage: number
          created_at: string | null
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          bonus_coins?: number
          bonus_percentage?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          bonus_coins?: number
          bonus_percentage?: number
          created_at?: string | null
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
          config_key: string
          config_value: Json
          created_at: string | null
          game_type: string
          id: string
          is_active: boolean | null
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value?: Json
          created_at?: string | null
          game_type: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          game_type?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string | null
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
          created_at: string | null
          game_type: string
          id: string
          is_active: boolean | null
          setting_key: string
          setting_value: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          game_type: string
          id?: string
          is_active?: boolean | null
          setting_key: string
          setting_value?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          game_type?: string
          id?: string
          is_active?: boolean | null
          setting_key?: string
          setting_value?: Json | null
          updated_at?: string | null
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
          created_at: string | null
          game_session_id: string | null
          game_type: string
          id: string
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          game_session_id?: string | null
          game_type: string
          id?: string
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          game_session_id?: string | null
          game_type?: string
          id?: string
          transaction_type?: string
          user_id?: string
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
          coin_amount: number
          coin_cost: number | null
          created_at: string | null
          gift_id: string | null
          id: string
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
          coin_amount: number
          coin_cost?: number | null
          created_at?: string | null
          gift_id?: string | null
          id?: string
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
          coin_amount?: number
          coin_cost?: number | null
          created_at?: string | null
          gift_id?: string | null
          id?: string
          quantity?: number | null
          receiver_beans?: number | null
          receiver_id?: string | null
          reel_id?: string | null
          room_id?: string | null
          sender_id?: string | null
          sender_type?: string | null
          stream_id?: string | null
        }
        Relationships: []
      }
      gifts: {
        Row: {
          animation_type: string | null
          animation_url: string | null
          category: string | null
          category_id: string | null
          coin_value: number
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_full_screen: boolean | null
          name: string
          receiver_beans: number | null
          sound_duration_ms: number | null
          sound_url: string | null
          svga_url: string | null
        }
        Insert: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_value: number
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_full_screen?: boolean | null
          name: string
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
        }
        Update: {
          animation_type?: string | null
          animation_url?: string | null
          category?: string | null
          category_id?: string | null
          coin_value?: number
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_full_screen?: boolean | null
          name?: string
          receiver_beans?: number | null
          sound_duration_ms?: number | null
          sound_url?: string | null
          svga_url?: string | null
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          country_code: string
          country_name: string
          created_at: string | null
          display_order: number | null
          icon_url: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          payment_method_name: string
          payment_type: string | null
        }
        Insert: {
          country_code: string
          country_name: string
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          payment_method_name: string
          payment_type?: string | null
        }
        Update: {
          country_code?: string
          country_name?: string
          created_at?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          payment_method_name?: string
          payment_type?: string | null
        }
        Relationships: []
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
          level: number
          level_name: string
          min_total_diamonds: number
          perks: Json | null
        }
        Insert: {
          badge_color?: string | null
          badge_icon?: string | null
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          level_name: string
          min_total_diamonds?: number
          perks?: Json | null
        }
        Update: {
          badge_color?: string | null
          badge_icon?: string | null
          commission_rate?: number
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          level_name?: string
          min_total_diamonds?: number
          perks?: Json | null
        }
        Relationships: []
      }
      helper_message_replies: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          reply_text: string
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          reply_text: string
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
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
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          customer_id: string
          diamond_amount: number
          helper_id: string
          id: string
          local_currency: string | null
          local_price: number | null
          notes: string | null
          package_id: string
          payment_method: string | null
          payment_proof_url: string | null
          processing_time_minutes: number | null
          status: string | null
          total_price_usd: number
          updated_at: string | null
        }
        Insert: {
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          customer_id: string
          diamond_amount: number
          helper_id: string
          id?: string
          local_currency?: string | null
          local_price?: number | null
          notes?: string | null
          package_id: string
          payment_method?: string | null
          payment_proof_url?: string | null
          processing_time_minutes?: number | null
          status?: string | null
          total_price_usd: number
          updated_at?: string | null
        }
        Update: {
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          customer_id?: string
          diamond_amount?: number
          helper_id?: string
          id?: string
          local_currency?: string | null
          local_price?: number | null
          notes?: string | null
          package_id?: string
          payment_method?: string | null
          payment_proof_url?: string | null
          processing_time_minutes?: number | null
          status?: string | null
          total_price_usd?: number
          updated_at?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        }
        Relationships: []
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
        Relationships: []
      }
      helper_withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          helper_id: string
          id: string
          payment_method_id: string | null
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
          payment_method_id?: string | null
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
          payment_method_id?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      host_applications: {
        Row: {
          age: number
          ai_analysis: Json | null
          country: string | null
          created_at: string | null
          face_verification_id: string | null
          host_photos: string[] | null
          id: string
          language: string[] | null
          notes: string | null
          photo_url: string | null
          real_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          updated_at: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          age: number
          ai_analysis?: Json | null
          country?: string | null
          created_at?: string | null
          face_verification_id?: string | null
          host_photos?: string[] | null
          id?: string
          language?: string[] | null
          notes?: string | null
          photo_url?: string | null
          real_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          age?: number
          ai_analysis?: Json | null
          country?: string | null
          created_at?: string | null
          face_verification_id?: string | null
          host_photos?: string[] | null
          id?: string
          language?: string[] | null
          notes?: string | null
          photo_url?: string | null
          real_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: []
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
          created_at: string | null
          id: string
          is_active: boolean | null
          leaderboard_type: string
          rank_position: number
          reward_amount: number
          reward_type: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          badge_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type: string
          rank_position: number
          reward_amount?: number
          reward_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          badge_url?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          leaderboard_type?: string
          rank_position?: number
          reward_amount?: number
          reward_type?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      leaderboard_reward_history: {
        Row: {
          claimed_at: string | null
          id: string
          leaderboard_type: string
          period_end: string
          period_start: string
          rank_position: number
          reward_amount: number
          reward_type: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          id?: string
          leaderboard_type: string
          period_end: string
          period_start: string
          rank_position: number
          reward_amount: number
          reward_type: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          id?: string
          leaderboard_type?: string
          period_end?: string
          period_start?: string
          rank_position?: number
          reward_amount?: number
          reward_type?: string
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
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          level: number
          privilege_key: string
          privilege_name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level: number
          privilege_key: string
          privilege_name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          level?: number
          privilege_key?: string
          privilege_name?: string
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
          ban_duration_hours: number | null
          ban_type: string | null
          banned_by: string
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          reason: string
          stream_id: string | null
          user_id: string
        }
        Insert: {
          ban_duration_hours?: number | null
          ban_type?: string | null
          banned_by: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason: string
          stream_id?: string | null
          user_id: string
        }
        Update: {
          ban_duration_hours?: number | null
          ban_type?: string | null
          banned_by?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reason?: string
          stream_id?: string | null
          user_id?: string
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
          stream_id?: string
          violation_type?: string
        }
        Relationships: []
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
          created_by: string | null
          ended_at: string | null
          game_type: string
          id: string
          result: string | null
          round_number: number | null
          started_at: string | null
          status: string | null
          stream_id: string
          total_pool: number | null
        }
        Insert: {
          created_by?: string | null
          ended_at?: string | null
          game_type: string
          id?: string
          result?: string | null
          round_number?: number | null
          started_at?: string | null
          status?: string | null
          stream_id: string
          total_pool?: number | null
        }
        Update: {
          created_by?: string | null
          ended_at?: string | null
          game_type?: string
          id?: string
          result?: string | null
          round_number?: number | null
          started_at?: string | null
          status?: string | null
          stream_id?: string
          total_pool?: number | null
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
          ended_at: string | null
          host_id: string
          id: string
          is_active: boolean | null
          room_id: string | null
          started_at: string | null
          status: string | null
          stream_type: string | null
          thumbnail_url: string | null
          title: string | null
          total_gifts: number | null
          viewer_count: number | null
        }
        Insert: {
          ended_at?: string | null
          host_id: string
          id?: string
          is_active?: boolean | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_type?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Update: {
          ended_at?: string | null
          host_id?: string
          id?: string
          is_active?: boolean | null
          room_id?: string | null
          started_at?: string | null
          status?: string | null
          stream_type?: string | null
          thumbnail_url?: string | null
          title?: string | null
          total_gifts?: number | null
          viewer_count?: number | null
        }
        Relationships: []
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
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_deleted: boolean | null
          is_encrypted: boolean | null
          is_read: boolean | null
          media_url: string | null
          message_type: string | null
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_encrypted?: boolean | null
          is_read?: boolean | null
          media_url?: string | null
          message_type?: string | null
          reply_to_id?: string | null
          sender_id?: string
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
          completed_at: string | null
          created_at: string | null
          day_number: number
          host_id: string
          id: string
          is_completed: boolean | null
          target_minutes: number
        }
        Insert: {
          actual_minutes?: number | null
          bonus_amount: number
          completed_at?: string | null
          created_at?: string | null
          day_number: number
          host_id: string
          id?: string
          is_completed?: boolean | null
          target_minutes: number
        }
        Update: {
          actual_minutes?: number | null
          bonus_amount?: number
          completed_at?: string | null
          created_at?: string | null
          day_number?: number
          host_id?: string
          id?: string
          is_completed?: boolean | null
          target_minutes?: number
        }
        Relationships: []
      }
      new_host_live_bonus_settings: {
        Row: {
          bonus_amount: number
          created_at: string | null
          day_number: number
          id: string
          is_active: boolean | null
          target_minutes: number
          updated_at: string | null
        }
        Insert: {
          bonus_amount: number
          created_at?: string | null
          day_number: number
          id?: string
          is_active?: boolean | null
          target_minutes: number
          updated_at?: string | null
        }
        Update: {
          bonus_amount?: number
          created_at?: string | null
          day_number?: number
          id?: string
          is_active?: boolean | null
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
      notification_templates: {
        Row: {
          action_data: Json | null
          action_type: string | null
          body: string
          created_at: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          template_key: string
          title: string
          updated_at: string | null
        }
        Insert: {
          action_data?: Json | null
          action_type?: string | null
          body: string
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          template_key: string
          title: string
          updated_at?: string | null
        }
        Update: {
          action_data?: Json | null
          action_type?: string | null
          body?: string
          created_at?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          template_key?: string
          title?: string
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
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_premium: boolean | null
          max_reward: number
          min_reward: number
          name: string
          reward_type: string
        }
        Insert: {
          coin_cost?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_reward: number
          min_reward: number
          name: string
          reward_type: string
        }
        Update: {
          coin_cost?: number | null
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_premium?: boolean | null
          max_reward?: number
          min_reward?: number
          name?: string
          reward_type?: string
        }
        Relationships: []
      }
      party_room_backgrounds: {
        Row: {
          category: string | null
          created_at: string | null
          display_order: number | null
          id: string
          image_url: string
          is_active: boolean | null
          is_free: boolean | null
          name: string
          price_coins: number | null
          thumbnail_url: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url: string
          is_active?: boolean | null
          is_free?: boolean | null
          name: string
          price_coins?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          display_order?: number | null
          id?: string
          image_url?: string
          is_active?: boolean | null
          is_free?: boolean | null
          name?: string
          price_coins?: number | null
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
        Relationships: []
      }
      party_rooms: {
        Row: {
          announcement: string | null
          background_url: string | null
          country_code: string | null
          created_at: string | null
          description: string | null
          ended_at: string | null
          host_id: string
          id: string
          is_active: boolean | null
          is_locked: boolean | null
          max_participants: number | null
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
          host_id: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          max_participants?: number | null
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
          host_id?: string
          id?: string
          is_active?: boolean | null
          is_locked?: boolean | null
          max_participants?: number | null
          mood?: string | null
          name?: string
          password?: string | null
          room_code?: string | null
          room_type?: string | null
          total_seats?: number | null
          welcome_message?: string | null
        }
        Relationships: []
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
          created_at: string | null
          display_order: number | null
          gateway_type: string
          id: string
          is_active: boolean | null
          name: string
          supported_currencies: string[] | null
          updated_at: string | null
        }
        Insert: {
          api_key_ref?: string | null
          config?: Json | null
          created_at?: string | null
          display_order?: number | null
          gateway_type: string
          id?: string
          is_active?: boolean | null
          name: string
          supported_currencies?: string[] | null
          updated_at?: string | null
        }
        Update: {
          api_key_ref?: string | null
          config?: Json | null
          created_at?: string | null
          display_order?: number | null
          gateway_type?: string
          id?: string
          is_active?: boolean | null
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
          created_at: string | null
          currency: string | null
          external_transaction_id: string | null
          gateway_id: string | null
          id: string
          package_id: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          gateway_id?: string | null
          id?: string
          package_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          external_transaction_id?: string | null
          gateway_id?: string | null
          id?: string
          package_id?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
          created_at: string | null
          duration_minutes: number | null
          ended_at: string | null
          host1_id: string
          host1_score: number | null
          host2_id: string
          host2_score: number | null
          id: string
          started_at: string | null
          status: string | null
          stream1_id: string | null
          stream2_id: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          host1_id: string
          host1_score?: number | null
          host2_id: string
          host2_score?: number | null
          id?: string
          started_at?: string | null
          status?: string | null
          stream1_id?: string | null
          stream2_id?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string | null
          duration_minutes?: number | null
          ended_at?: string | null
          host1_id?: string
          host1_score?: number | null
          host2_id?: string
          host2_score?: number | null
          id?: string
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
        Relationships: []
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
        Relationships: []
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
      rating_reward_claims: {
        Row: {
          claimed_at: string
          id: string
          platform: string
          reward_coins: number
          user_id: string
        }
        Insert: {
          claimed_at?: string
          id?: string
          platform: string
          reward_coins?: number
          user_id: string
        }
        Update: {
          claimed_at?: string
          id?: string
          platform?: string
          reward_coins?: number
          user_id?: string
        }
        Relationships: []
      }
      recharge_transactions: {
        Row: {
          admin_notes: string | null
          amount: number
          bonus_coins: number | null
          coins_amount: number
          created_at: string
          currency: string | null
          exchange_rate: number | null
          helper_id: string | null
          id: string
          order_id: string | null
          payment_method: string | null
          payment_method_id: string | null
          payment_proof_url: string | null
          processed_at: string | null
          processed_by: string | null
          status: string
          updated_at: string
          usd_amount: number | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          bonus_coins?: number | null
          coins_amount: number
          created_at?: string
          currency?: string | null
          exchange_rate?: number | null
          helper_id?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
          updated_at?: string
          usd_amount?: number | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          bonus_coins?: number | null
          coins_amount?: number
          created_at?: string
          currency?: string | null
          exchange_rate?: number | null
          helper_id?: string | null
          id?: string
          order_id?: string | null
          payment_method?: string | null
          payment_method_id?: string | null
          payment_proof_url?: string | null
          processed_at?: string | null
          processed_by?: string | null
          status?: string
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
        Relationships: []
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
        Relationships: []
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
          caption: string | null
          category_id: string | null
          comments_count: number | null
          created_at: string
          duration_seconds: number | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          likes_count: number | null
          music_id: string | null
          shares_count: number | null
          thumbnail_url: string | null
          updated_at: string
          user_id: string
          video_url: string
          views_count: number | null
        }
        Insert: {
          caption?: string | null
          category_id?: string | null
          comments_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          likes_count?: number | null
          music_id?: string | null
          shares_count?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id: string
          video_url: string
          views_count?: number | null
        }
        Update: {
          caption?: string | null
          category_id?: string | null
          comments_count?: number | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          likes_count?: number | null
          music_id?: string | null
          shares_count?: number | null
          thumbnail_url?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string
          views_count?: number | null
        }
        Relationships: []
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
      role_frames: {
        Row: {
          created_at: string | null
          display_order: number | null
          frame_url: string
          id: string
          is_active: boolean | null
          min_level: number | null
          name: string
          role_type: string
        }
        Insert: {
          created_at?: string | null
          display_order?: number | null
          frame_url: string
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          name: string
          role_type: string
        }
        Update: {
          created_at?: string | null
          display_order?: number | null
          frame_url?: string
          id?: string
          is_active?: boolean | null
          min_level?: number | null
          name?: string
          role_type?: string
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
        Relationships: []
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
          animation_url: string | null
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          duration_days: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          is_permanent: boolean | null
          is_vip_exclusive: boolean | null
          item_type: string
          level_required: number | null
          name: string
          preview_url: string | null
          price_coins: number | null
          price_diamonds: number | null
          svga_url: string | null
          tag: string | null
          updated_at: string
          vip_discount_percent: number | null
        }
        Insert: {
          animation_url?: string | null
          category: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_permanent?: boolean | null
          is_vip_exclusive?: boolean | null
          item_type: string
          level_required?: number | null
          name: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          svga_url?: string | null
          tag?: string | null
          updated_at?: string
          vip_discount_percent?: number | null
        }
        Update: {
          animation_url?: string | null
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          is_permanent?: boolean | null
          is_vip_exclusive?: boolean | null
          item_type?: string
          level_required?: number | null
          name?: string
          preview_url?: string | null
          price_coins?: number | null
          price_diamonds?: number | null
          svga_url?: string | null
          tag?: string | null
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          diamonds_received: number
          exchange_rate: number
          id: string
          tier_id: string | null
          user_id: string
        }
        Insert: {
          beans_amount: number
          created_at?: string
          diamonds_received: number
          exchange_rate: number
          id?: string
          tier_id?: string | null
          user_id: string
        }
        Update: {
          beans_amount?: number
          created_at?: string
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
      user_parcels: {
        Row: {
          claimed_at: string | null
          coins_amount: number
          created_at: string
          expires_at: string | null
          id: string
          parcel_template_id: string | null
          parcel_type: string
          source: string | null
          status: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          coins_amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          parcel_template_id?: string | null
          parcel_type?: string
          source?: string | null
          status?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          coins_amount?: number
          created_at?: string
          expires_at?: string | null
          id?: string
          parcel_template_id?: string | null
          parcel_type?: string
          source?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      user_purchased_backgrounds: {
        Row: {
          background_id: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          purchased_at: string
          user_id: string
        }
        Insert: {
          background_id: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          purchased_at?: string
          user_id: string
        }
        Update: {
          background_id?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
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
        Relationships: []
      }
      user_role_frames: {
        Row: {
          equipped: boolean | null
          expires_at: string | null
          frame_id: string
          id: string
          purchased_at: string | null
          user_id: string
        }
        Insert: {
          equipped?: boolean | null
          expires_at?: string | null
          frame_id: string
          id?: string
          purchased_at?: string | null
          user_id: string
        }
        Update: {
          equipped?: boolean | null
          expires_at?: string | null
          frame_id?: string
          id?: string
          purchased_at?: string | null
          user_id?: string
        }
        Relationships: []
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
          id: string
          is_completed: boolean | null
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
          id?: string
          is_completed?: boolean | null
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
          id?: string
          is_completed?: boolean | null
          reward_claimed?: boolean | null
          task_date?: string | null
          task_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      vip_tiers: {
        Row: {
          ad_free: boolean | null
          badge_animation_url: string | null
          badge_color: string | null
          badge_url: string | null
          benefits: Json | null
          bubble_animation_url: string | null
          created_at: string
          description: string | null
          display_order: number | null
          duration_days: number | null
          entrance_url: string | null
          entry_animation_url: string | null
          exclusive_bubbles: boolean | null
          exclusive_entry_bars: boolean | null
          exclusive_frames: boolean | null
          exclusive_gifts: boolean | null
          exclusive_stickers: boolean | null
          faster_support: boolean | null
          frame_animation_url: string | null
          frame_url: string | null
          id: string
          is_active: boolean | null
          price_diamonds: number | null
          price_monthly: number
          price_yearly: number | null
          priority_matching: boolean | null
          profile_highlight: boolean | null
          tier_code: string | null
          tier_level: number
          tier_name: string
          updated_at: string
          vip_only_rooms: boolean | null
        }
        Insert: {
          ad_free?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          frame_animation_url?: string | null
          frame_url?: string | null
          id?: string
          is_active?: boolean | null
          price_diamonds?: number | null
          price_monthly: number
          price_yearly?: number | null
          priority_matching?: boolean | null
          profile_highlight?: boolean | null
          tier_code?: string | null
          tier_level: number
          tier_name: string
          updated_at?: string
          vip_only_rooms?: boolean | null
        }
        Update: {
          ad_free?: boolean | null
          badge_animation_url?: string | null
          badge_color?: string | null
          badge_url?: string | null
          benefits?: Json | null
          bubble_animation_url?: string | null
          created_at?: string
          description?: string | null
          display_order?: number | null
          duration_days?: number | null
          entrance_url?: string | null
          entry_animation_url?: string | null
          exclusive_bubbles?: boolean | null
          exclusive_entry_bars?: boolean | null
          exclusive_frames?: boolean | null
          exclusive_gifts?: boolean | null
          exclusive_stickers?: boolean | null
          faster_support?: boolean | null
          frame_animation_url?: string | null
          frame_url?: string | null
          id?: string
          is_active?: boolean | null
          price_diamonds?: number | null
          price_monthly?: number
          price_yearly?: number | null
          priority_matching?: boolean | null
          profile_highlight?: boolean | null
          tier_code?: string | null
          tier_level?: number
          tier_name?: string
          updated_at?: string
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
        Relationships: []
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
      admin_block_user: {
        Args: { _block: boolean; _reason?: string; _user_id: string }
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
        Args: { _gender: string; _user_id: string }
        Returns: boolean
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
      apply_as_topup_helper: { Args: { _data: Json }; Returns: Json }
      approve_host_request: {
        Args: { _admin_id: string; _agency_id: string; _request_id: string }
        Returns: boolean
      }
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
        Args: { _room_id: string; _user_id: string }
        Returns: boolean
      }
      cancel_account_deletion: { Args: { _user_id: string }; Returns: boolean }
      cancel_agency_request: { Args: { _host_id: string }; Returns: boolean }
      check_ban_on_login: { Args: { _user_id: string }; Returns: Json }
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
      check_user_permission: {
        Args: { p_permission: string; p_user_id: string }
        Returns: boolean
      }
      claim_daily_login_reward: { Args: never; Returns: Json }
      claim_invitation_reward: {
        Args: {
          _beans?: number
          _coins?: number
          _diamonds?: number
          _user_id: string
        }
        Returns: boolean
      }
      claim_new_host_live_bonus: {
        Args: { _bonus_coins?: number; _host_id: string }
        Returns: Json
      }
      claim_parcel_reward: { Args: { _parcel_id: string }; Returns: Json }
      claim_task_reward: {
        Args: { _task_id: string; _user_id: string }
        Returns: Json
      }
      cleanup_stale_party_participants: { Args: never; Returns: undefined }
      create_guest_profile: { Args: { _device_id: string }; Returns: Json }
      create_sub_agent: {
        Args: {
          _agency_id: string
          _commission_rate?: number
          _name: string
          _user_id: string
        }
        Returns: string
      }
      decline_private_call: { Args: { _call_id: string }; Returns: boolean }
      deduct_coins_atomic: {
        Args: { p_amount: number; p_user_id: string }
        Returns: Json
      }
      end_private_call: { Args: { _call_id: string }; Returns: Json }
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
      get_admin_dashboard_stats: { Args: never; Returns: Json }
      get_agency_by_code: {
        Args: { agency_code: string }
        Returns: {
          id: string
          level: string
          name: string
          total_hosts: number
        }[]
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
      get_effective_host_percent: { Args: never; Returns: number }
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
      is_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _user_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_real_user: { Args: never; Returns: boolean }
      join_agency: {
        Args: { _agency_code: string; _host_id: string; _joined_via?: string }
        Returns: boolean
      }
      log_admin_action: {
        Args: {
          _action_type: string
          _details?: Json
          _target_id?: string
          _target_type?: string
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
      process_weekly_agency_transfers: { Args: never; Returns: Json }
      recalculate_all_user_levels: { Args: never; Returns: undefined }
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
      request_agency_withdrawal: {
        Args: {
          _agency_id: string
          _amount: number
          _payment_details?: Json
          _payment_method?: string
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
      start_private_call: {
        Args: {
          p_call_type?: string
          p_caller_id: string
          p_receiver_id: string
        }
        Returns: Json
      }
      transfer_coins_to_user: {
        Args: {
          _amount: number
          _note?: string
          _receiver_id: string
          _sender_id: string
        }
        Returns: boolean
      }
      update_online_status: {
        Args: {
          p_is_online: boolean
          p_last_seen_at?: string
          p_user_id: string
        }
        Returns: undefined
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
      validate_user_task_progress_claim: {
        Args: { _task_id: string; _user_id: string }
        Returns: Json
      }
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
