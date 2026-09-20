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
      admin_permissions: {
        Row: {
          created_at: string
          id: string
          permission_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permission_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permission_key?: string
          user_id?: string
        }
        Relationships: []
      }
      android_devices: {
        Row: {
          archived_at: string | null
          battery_level: number | null
          created_at: string
          device_id: string
          device_name: string
          failed_deliveries: number | null
          id: string
          is_active: boolean
          is_charging: boolean | null
          is_primary_hormuud_sim: boolean
          last_ping_at: string | null
          primary_for_provider: string | null
          provider_name: string
          send_enabled: boolean
          sim_number: string
          sim1_enabled: boolean
          sim1_priority: number
          sim1_provider: string | null
          sim2_enabled: boolean
          sim2_number: string | null
          sim2_priority: number
          sim2_provider: string | null
          total_deliveries: number | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id: string
          device_name: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          is_primary_hormuud_sim?: boolean
          last_ping_at?: string | null
          primary_for_provider?: string | null
          provider_name: string
          send_enabled?: boolean
          sim_number: string
          sim1_enabled?: boolean
          sim1_priority?: number
          sim1_provider?: string | null
          sim2_enabled?: boolean
          sim2_number?: string | null
          sim2_priority?: number
          sim2_provider?: string | null
          total_deliveries?: number | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          battery_level?: number | null
          created_at?: string
          device_id?: string
          device_name?: string
          failed_deliveries?: number | null
          id?: string
          is_active?: boolean
          is_charging?: boolean | null
          is_primary_hormuud_sim?: boolean
          last_ping_at?: string | null
          primary_for_provider?: string | null
          provider_name?: string
          send_enabled?: boolean
          sim_number?: string
          sim1_enabled?: boolean
          sim1_priority?: number
          sim1_provider?: string | null
          sim2_enabled?: boolean
          sim2_number?: string | null
          sim2_priority?: number
          sim2_provider?: string | null
          total_deliveries?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          app_key: string
          app_name: string
          created_at: string
          file_path: string
          file_size: number
          id: string
          is_current: boolean
          release_notes: string | null
          updated_at: string
          version: string
        }
        Insert: {
          app_key: string
          app_name: string
          created_at?: string
          file_path: string
          file_size?: number
          id?: string
          is_current?: boolean
          release_notes?: string | null
          updated_at?: string
          version: string
        }
        Update: {
          app_key?: string
          app_name?: string
          created_at?: string
          file_path?: string
          file_size?: number
          id?: string
          is_current?: boolean
          release_notes?: string | null
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string
          id: string
          setting_key: string
          setting_value: boolean | null
          text_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          setting_key: string
          setting_value?: boolean | null
          text_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          setting_key?: string
          setting_value?: boolean | null
          text_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      auto_topup_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_numbers: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
        }
        Relationships: []
      }
      auto_topup_packages: {
        Row: {
          cost_price: number
          created_at: string
          data_amount: string
          id: string
          is_active: boolean
          package_name: string
          provider_name: string
          selling_price: number
          sim_password: string | null
          topup_number_id: string
          ussd_code: string | null
        }
        Insert: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name: string
          provider_name?: string
          selling_price: number
          sim_password?: string | null
          topup_number_id: string
          ussd_code?: string | null
        }
        Update: {
          cost_price?: number
          created_at?: string
          data_amount?: string
          id?: string
          is_active?: boolean
          package_name?: string
          provider_name?: string
          selling_price?: number
          sim_password?: string | null
          topup_number_id?: string
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_packages_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_topup_phone_mappings: {
        Row: {
          category_name: string | null
          created_at: string
          custom_amount: string | null
          id: string
          is_active: boolean
          label: string | null
          package_id: string | null
          phone_number: string
          topup_number_id: string
        }
        Insert: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number: string
          topup_number_id: string
        }
        Update: {
          category_name?: string | null
          created_at?: string
          custom_amount?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          package_id?: string | null
          phone_number?: string
          topup_number_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_topup_phone_mappings_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_topup_phone_mappings_topup_number_id_fkey"
            columns: ["topup_number_id"]
            isOneToOne: false
            referencedRelation: "auto_topup_numbers"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_credentials: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          password_hash: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          password_hash?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      bank_sessions: {
        Row: {
          created_at: string
          credential_id: string
          expires_at: string
          id: string
          last_used_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          credential_id: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          credential_id?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_sessions_credential_id_fkey"
            columns: ["credential_id"]
            isOneToOne: false
            referencedRelation: "bank_credentials"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          acc_no: string | null
          charge_amt: number | null
          created_at: string
          currency_code: string | null
          customer_name: string | null
          dr_cr: string | null
          id: string
          match_notes: string | null
          match_status: string
          matched_order_id: string | null
          matched_payment_id: string | null
          narration: string | null
          parsed_receiver_phone: string | null
          parsed_sender_phone: string | null
          processed_at: string | null
          raw_payload: Json | null
          rrp_no: string | null
          tran_amt: number
          tran_date: string | null
          tran_date_time: string | null
          tran_desc: string | null
          tran_no: string
          tran_type: string | null
          user_id_field: string | null
          uti: string | null
        }
        Insert: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tran_amt: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Update: {
          acc_no?: string | null
          charge_amt?: number | null
          created_at?: string
          currency_code?: string | null
          customer_name?: string | null
          dr_cr?: string | null
          id?: string
          match_notes?: string | null
          match_status?: string
          matched_order_id?: string | null
          matched_payment_id?: string | null
          narration?: string | null
          parsed_receiver_phone?: string | null
          parsed_sender_phone?: string | null
          processed_at?: string | null
          raw_payload?: Json | null
          rrp_no?: string | null
          tran_amt?: number
          tran_date?: string | null
          tran_date_time?: string | null
          tran_desc?: string | null
          tran_no?: string
          tran_type?: string | null
          user_id_field?: string | null
          uti?: string | null
        }
        Relationships: []
      }
      banners_config: {
        Row: {
          alt_text: string | null
          banner_image: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          media_type: string | null
          rotation_interval: number | null
          updated_at: string
          video_duration: number | null
        }
        Insert: {
          alt_text?: string | null
          banner_image: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          updated_at?: string
          video_duration?: number | null
        }
        Update: {
          alt_text?: string | null
          banner_image?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string | null
          rotation_interval?: number | null
          updated_at?: string
          video_duration?: number | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          is_active: boolean
          phone_number: string
          reason: string | null
          unblocked_at: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number: string
          reason?: string | null
          unblocked_at?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          phone_number?: string
          reason?: string | null
          unblocked_at?: string | null
        }
        Relationships: []
      }
      bulk_sms_campaigns: {
        Row: {
          created_at: string
          device_id: string | null
          failed_count: number
          id: string
          message: string
          sent_count: number
          sim_slot: number | null
          status: string
          target_type: string
          total_recipients: number
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          total_recipients?: number
        }
        Update: {
          created_at?: string
          device_id?: string | null
          failed_count?: number
          id?: string
          message?: string
          sent_count?: number
          sim_slot?: number | null
          status?: string
          target_type?: string
          total_recipients?: number
        }
        Relationships: []
      }
      bulk_sms_queue: {
        Row: {
          campaign_id: string
          created_at: string
          device_id: string | null
          error_message: string | null
          id: string
          phone_number: string
          sent_at: string | null
          sim_slot: number | null
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          device_id?: string | null
          error_message?: string | null
          id?: string
          phone_number?: string
          sent_at?: string | null
          sim_slot?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_sms_queue_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "bulk_sms_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_discounts: {
        Row: {
          applicable_to: string | null
          created_at: string
          customer_phone: string
          discount_type: string | null
          discount_value: number
          id: string
          is_active: boolean
          notes: string | null
          package_id: string | null
          provider_id: string | null
        }
        Insert: {
          applicable_to?: string | null
          created_at?: string
          customer_phone: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
        }
        Update: {
          applicable_to?: string | null
          created_at?: string
          customer_phone?: string
          discount_type?: string | null
          discount_value?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          package_id?: string | null
          provider_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_discounts_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_discounts_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      data_packages_config: {
        Row: {
          category_id: string | null
          connection_type_label: string
          cost_price: number
          created_at: string
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          is_discovery_root: boolean
          is_ussd_only: boolean
          menu1: string | null
          menu2: string | null
          package_name: string
          phone_prefix: string | null
          profit_margin: number | null
          provider_id: string
          secret_price: number | null
          secret_prices: number[]
          selling_price: number
          sim_password: string | null
          somlink_bundle_id: number | null
          updated_at: string
          ussd_code: string | null
          validity_days: string
        }
        Insert: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_discovery_root?: boolean
          is_ussd_only?: boolean
          menu1?: string | null
          menu2?: string | null
          package_name: string
          phone_prefix?: string | null
          profit_margin?: number | null
          provider_id: string
          secret_price?: number | null
          secret_prices?: number[]
          selling_price: number
          sim_password?: string | null
          somlink_bundle_id?: number | null
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
        }
        Update: {
          category_id?: string | null
          connection_type_label?: string
          cost_price?: number
          created_at?: string
          data_amount?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_discovery_root?: boolean
          is_ussd_only?: boolean
          menu1?: string | null
          menu2?: string | null
          package_name?: string
          phone_prefix?: string | null
          profit_margin?: number | null
          provider_id?: string
          secret_price?: number | null
          secret_prices?: number[]
          selling_price?: number
          sim_password?: string | null
          somlink_bundle_id?: number | null
          updated_at?: string
          ussd_code?: string | null
          validity_days?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_packages_config_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "data_packages_config_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_instructions: {
        Row: {
          category_id: string | null
          code_template: string | null
          created_at: string
          execution_order: number | null
          id: string
          instruction_template: string | null
          instruction_type: string
          notes: string | null
          order_id: string | null
          package_id: string | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string | null
          sim_password: string | null
          status: string | null
          ussd_code: string | null
        }
        Insert: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          ussd_code?: string | null
        }
        Update: {
          category_id?: string | null
          code_template?: string | null
          created_at?: string
          execution_order?: number | null
          id?: string
          instruction_template?: string | null
          instruction_type?: string
          notes?: string | null
          order_id?: string | null
          package_id?: string | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string | null
          sim_password?: string | null
          status?: string | null
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_instructions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "package_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_instructions_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_queue: {
        Row: {
          android_device_id: string | null
          attempts: number | null
          completed_at: string | null
          created_at: string
          discovery_menu_label: string | null
          dispatch_device_id: string | null
          dispatched_at: string | null
          error_message: string | null
          id: string
          last_attempt_at: string | null
          lease_device_id: string | null
          lease_expires_at: string | null
          lease_renewed_at: string | null
          order_id: string
          package_code: string | null
          pin_code: string | null
          provider_name: string
          provider_response: string | null
          receiver_phone: string
          scheduled_at: string | null
          sim_slot: number | null
          somlink_response: Json | null
          status: string | null
          ussd_code: string | null
        }
        Insert: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          discovery_menu_label?: string | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          lease_device_id?: string | null
          lease_expires_at?: string | null
          lease_renewed_at?: string | null
          order_id: string
          package_code?: string | null
          pin_code?: string | null
          provider_name: string
          provider_response?: string | null
          receiver_phone: string
          scheduled_at?: string | null
          sim_slot?: number | null
          somlink_response?: Json | null
          status?: string | null
          ussd_code?: string | null
        }
        Update: {
          android_device_id?: string | null
          attempts?: number | null
          completed_at?: string | null
          created_at?: string
          discovery_menu_label?: string | null
          dispatch_device_id?: string | null
          dispatched_at?: string | null
          error_message?: string | null
          id?: string
          last_attempt_at?: string | null
          lease_device_id?: string | null
          lease_expires_at?: string | null
          lease_renewed_at?: string | null
          order_id?: string
          package_code?: string | null
          pin_code?: string | null
          provider_name?: string
          provider_response?: string | null
          receiver_phone?: string
          scheduled_at?: string | null
          sim_slot?: number | null
          somlink_response?: Json | null
          status?: string | null
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_queue_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      device_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          device_id: string
          device_name: string | null
          id: string
          is_acknowledged: boolean
          is_resolved: boolean | null
          message: string | null
          resolved_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          device_id: string
          device_name?: string | null
          id?: string
          is_acknowledged?: boolean
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          device_id?: string
          device_name?: string | null
          id?: string
          is_acknowledged?: boolean
          is_resolved?: boolean | null
          message?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      discovery_unmatched_labels: {
        Row: {
          created_at: string
          hits: number
          id: string
          last_seen_at: string
          normalized_label: string
          raw_label: string
          root_package_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          normalized_label: string
          raw_label: string
          root_package_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          hits?: number
          id?: string
          last_seen_at?: string
          normalized_label?: string
          raw_label?: string
          root_package_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discovery_unmatched_labels_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      error_messages: {
        Row: {
          created_at: string
          error_code: string
          error_type: string | null
          icon_type: string | null
          icon_value: string | null
          id: string
          is_active: boolean
          is_animated: boolean | null
          message: string | null
          message_en: string | null
          message_so: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          error_code: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          error_code?: string
          error_type?: string | null
          icon_type?: string | null
          icon_value?: string | null
          id?: string
          is_active?: boolean
          is_animated?: boolean | null
          message?: string | null
          message_en?: string | null
          message_so?: string | null
          title?: string | null
        }
        Relationships: []
      }
      featured_packages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          package_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "featured_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_alerts: {
        Row: {
          alert_type: string
          amount: number
          created_at: string
          description: string | null
          id: string
          is_reviewed: boolean
          notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sender_phone: string
          severity: string
        }
        Insert: {
          alert_type: string
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone: string
          severity?: string
        }
        Update: {
          alert_type?: string
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          is_reviewed?: boolean
          notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sender_phone?: string
          severity?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          title?: string
        }
        Relationships: []
      }
      offline_payment_numbers: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string | null
          phone_number: string
          updated_at: string
          ussd_prefix: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number: string
          updated_at?: string
          ussd_prefix?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string | null
          phone_number?: string
          updated_at?: string
          ussd_prefix?: string | null
        }
        Relationships: []
      }
      offline_registrations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          provider_id: string | null
          provider_name: string | null
          receiver_phone: string
          sender_phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone: string
          sender_phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          provider_id?: string | null
          provider_name?: string | null
          receiver_phone?: string
          sender_phone?: string
          updated_at?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          cost_price: number
          created_at: string
          customer_phone: string
          data_amount: string | null
          delivered_at: string | null
          delivery_notes: string | null
          delivery_status: string | null
          discovery_menu_label: string | null
          discovery_root_id: string | null
          id: string
          invoice_url: string | null
          is_manual: boolean | null
          manual_action_at: string | null
          manual_action_by: string | null
          manual_action_email: string | null
          manual_action_note: string | null
          manual_action_type: string | null
          package_id: string | null
          package_name: string
          payment_number: string | null
          payment_provider_id: string | null
          payment_source: string | null
          provider_id: string | null
          receiver_phone: string
          scheduled_for: string | null
          selling_price: number
          sender_phone: string | null
          status: string
          tx_id: string | null
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          customer_phone: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          discovery_menu_label?: string | null
          discovery_root_id?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          manual_action_at?: string | null
          manual_action_by?: string | null
          manual_action_email?: string | null
          manual_action_note?: string | null
          manual_action_type?: string | null
          package_id?: string | null
          package_name: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone: string
          scheduled_for?: string | null
          selling_price: number
          sender_phone?: string | null
          status?: string
          tx_id?: string | null
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          customer_phone?: string
          data_amount?: string | null
          delivered_at?: string | null
          delivery_notes?: string | null
          delivery_status?: string | null
          discovery_menu_label?: string | null
          discovery_root_id?: string | null
          id?: string
          invoice_url?: string | null
          is_manual?: boolean | null
          manual_action_at?: string | null
          manual_action_by?: string | null
          manual_action_email?: string | null
          manual_action_note?: string | null
          manual_action_type?: string | null
          package_id?: string | null
          package_name?: string
          payment_number?: string | null
          payment_provider_id?: string | null
          payment_source?: string | null
          provider_id?: string | null
          receiver_phone?: string
          scheduled_for?: string | null
          selling_price?: number
          sender_phone?: string | null
          status?: string
          tx_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_payment_provider_id_fkey"
            columns: ["payment_provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      package_categories: {
        Row: {
          category_image: string | null
          category_name: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string | null
          updated_at: string
        }
        Insert: {
          category_image?: string | null
          category_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
          updated_at?: string
        }
        Update: {
          category_image?: string | null
          category_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          provider_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_categories_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      package_delivery_rules: {
        Row: {
          created_at: string
          delay_minutes: number
          delivery_count: number
          execution_order: number
          id: string
          is_active: boolean
          notes: string | null
          source_package_id: string
          target_package_id: string
        }
        Insert: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id: string
          target_package_id: string
        }
        Update: {
          created_at?: string
          delay_minutes?: number
          delivery_count?: number
          execution_order?: number
          id?: string
          is_active?: boolean
          notes?: string | null
          source_package_id?: string
          target_package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_delivery_rules_source_package_id_fkey"
            columns: ["source_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_delivery_rules_target_package_id_fkey"
            columns: ["target_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers_config: {
        Row: {
          commission_rate: number
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          payment_number: string | null
          prefix_code: string | null
          provider_logo: string | null
          provider_name: string
          updated_at: string
          ussd_code_template: string | null
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Update: {
          commission_rate?: number
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          payment_number?: string | null
          prefix_code?: string | null
          provider_logo?: string | null
          provider_name?: string
          updated_at?: string
          ussd_code_template?: string | null
        }
        Relationships: []
      }
      payment_receipts: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string | null
          id: string
          matched_order_id: string | null
          matching_strategy: string | null
          processed_at: string | null
          receiver_sim: string | null
          sender_phone: string
          sms_body: string | null
          status: string | null
          tx_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone: string
          sms_body?: string | null
          status?: string | null
          tx_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string | null
          id?: string
          matched_order_id?: string | null
          matching_strategy?: string | null
          processed_at?: string | null
          receiver_sim?: string | null
          sender_phone?: string
          sms_body?: string | null
          status?: string | null
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_receipts_matched_order_id_fkey"
            columns: ["matched_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_online_payments: {
        Row: {
          created_at: string
          discovery_menu_index: string | null
          discovery_menu_label: string | null
          expected_amount: number
          id: string
          matched_at: string | null
          package_id: string | null
          payment_provider: string | null
          provider_id: string | null
          receiver_phone: string
          scheduled_for: string | null
          sender_phone: string
          status: string
          verified_phone: string | null
        }
        Insert: {
          created_at?: string
          discovery_menu_index?: string | null
          discovery_menu_label?: string | null
          expected_amount: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone: string
          scheduled_for?: string | null
          sender_phone: string
          status?: string
          verified_phone?: string | null
        }
        Update: {
          created_at?: string
          discovery_menu_index?: string | null
          discovery_menu_label?: string | null
          expected_amount?: number
          id?: string
          matched_at?: string | null
          package_id?: string | null
          payment_provider?: string | null
          provider_id?: string | null
          receiver_phone?: string
          scheduled_for?: string | null
          sender_phone?: string
          status?: string
          verified_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_online_payments_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_online_payments_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers_config"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_response_messages: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          message_en: string
          message_so: string
          provider_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          message_en?: string
          message_so?: string
          provider_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          message_en?: string
          message_so?: string
          provider_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      providers_config: {
        Row: {
          created_at: string
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string | null
          provider_logo: string | null
          provider_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          evoucher_rate?: number
          id?: string
          is_active?: boolean
          promotional_text?: string | null
          provider_logo?: string | null
          provider_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          earnings: number
          id: string
          phone: string
          points: number
          total_referrals: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          earnings?: number
          id?: string
          phone: string
          points?: number
          total_referrals?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          earnings?: number
          id?: string
          phone?: string
          points?: number
          total_referrals?: number
          updated_at?: string
        }
        Relationships: []
      }
      referral_redemptions: {
        Row: {
          amount_awarded: number
          code_used: string
          created_at: string
          id: string
          points_awarded: number
          referred_phone: string
          referrer_phone: string
        }
        Insert: {
          amount_awarded?: number
          code_used: string
          created_at?: string
          id?: string
          points_awarded?: number
          referred_phone: string
          referrer_phone: string
        }
        Update: {
          amount_awarded?: number
          code_used?: string
          created_at?: string
          id?: string
          points_awarded?: number
          referred_phone?: string
          referrer_phone?: string
        }
        Relationships: []
      }
      reversal_alerts: {
        Row: {
          amount: number | null
          created_at: string
          dismissed_at: string | null
          dismissed_by: string | null
          id: string
          sender_phone: string | null
          sms_body: string
          sms_log_id: string | null
          ussd_code: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          sender_phone?: string | null
          sms_body: string
          sms_log_id?: string | null
          ussd_code?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          id?: string
          sender_phone?: string | null
          sms_body?: string
          sms_log_id?: string | null
          ussd_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reversal_alerts_sms_log_id_fkey"
            columns: ["sms_log_id"]
            isOneToOne: false
            referencedRelation: "sms_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_balances: {
        Row: {
          balance: number
          balance_source: string
          balance_type: string
          created_at: string
          device_id: string | null
          id: string
          last_updated: string
          sim_id: string | null
          sim_slot: number
        }
        Insert: {
          balance?: number
          balance_source?: string
          balance_type?: string
          created_at?: string
          device_id?: string | null
          id?: string
          last_updated?: string
          sim_id?: string | null
          sim_slot?: number
        }
        Update: {
          balance?: number
          balance_source?: string
          balance_type?: string
          created_at?: string
          device_id?: string | null
          id?: string
          last_updated?: string
          sim_id?: string | null
          sim_slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "sim_balances_sim_id_fkey"
            columns: ["sim_id"]
            isOneToOne: false
            referencedRelation: "android_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_logs: {
        Row: {
          amount: number | null
          counterpart_phone: string | null
          created_at: string
          device_id: string
          id: string
          received_at: string
          sim_number: string | null
          sim_slot: number
          sms_body: string
          sms_sender: string | null
          sms_type: string
          tx_id: string | null
          tx_type: string | null
        }
        Insert: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body: string
          sms_sender?: string | null
          sms_type?: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Update: {
          amount?: number | null
          counterpart_phone?: string | null
          created_at?: string
          device_id?: string
          id?: string
          received_at?: string
          sim_number?: string | null
          sim_slot?: number
          sms_body?: string
          sms_sender?: string | null
          sms_type?: string
          tx_id?: string | null
          tx_type?: string | null
        }
        Relationships: []
      }
      user_acquisition_sources: {
        Row: {
          created_at: string
          id: string
          other_text: string | null
          phone_number: string
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          other_text?: string | null
          phone_number: string
          source: string
        }
        Update: {
          created_at?: string
          id?: string
          other_text?: string | null
          phone_number?: string
          source?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      ussd_logs: {
        Row: {
          content: string | null
          created_at: string
          direction: string
          id: string
          origin: string | null
          sessionid: string
          ussdstate: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          direction: string
          id?: string
          origin?: string | null
          sessionid: string
          ussdstate?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          direction?: string
          id?: string
          origin?: string | null
          sessionid?: string
          ussdstate?: string | null
        }
        Relationships: []
      }
      ussd_package_discoveries: {
        Row: {
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          device_id: string | null
          error: string | null
          expires_at: string | null
          id: string
          items: Json
          phone_number: string
          queued_at: string
          raw_menu: string | null
          root_package_id: string
          selected_index: string | null
          selected_label: string | null
          selected_order_id: string | null
          session_device_id: string | null
          session_expires_at: string | null
          session_note: string | null
          session_state: string
          status: string
          updated_at: string
        }
        Insert: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          items?: Json
          phone_number: string
          queued_at?: string
          raw_menu?: string | null
          root_package_id: string
          selected_index?: string | null
          selected_label?: string | null
          selected_order_id?: string | null
          session_device_id?: string | null
          session_expires_at?: string | null
          session_note?: string | null
          session_state?: string
          status?: string
          updated_at?: string
        }
        Update: {
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          device_id?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          items?: Json
          phone_number?: string
          queued_at?: string
          raw_menu?: string | null
          root_package_id?: string
          selected_index?: string | null
          selected_label?: string | null
          selected_order_id?: string | null
          session_device_id?: string | null
          session_expires_at?: string | null
          session_note?: string | null
          session_state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_package_discoveries_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      ussd_price_catalog: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          info_line1: string | null
          info_line2: string | null
          is_active: boolean
          label: string
          normalized_label: string | null
          root_package_id: string
          selling_price: number
          updated_at: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          info_line1?: string | null
          info_line2?: string | null
          is_active?: boolean
          label: string
          normalized_label?: string | null
          root_package_id: string
          selling_price?: number
          updated_at?: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          info_line1?: string | null
          info_line2?: string | null
          is_active?: boolean
          label?: string
          normalized_label?: string | null
          root_package_id?: string
          selling_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_price_catalog_root_package_id_fkey"
            columns: ["root_package_id"]
            isOneToOne: false
            referencedRelation: "data_packages_config"
            referencedColumns: ["id"]
          },
        ]
      }
      ussd_sessions: {
        Row: {
          created_at: string
          id: string
          is_closed: boolean
          last_input: string | null
          order_id: string | null
          origin: string
          sessionid: string
          shortcode: string | null
          state: Json
          step: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_closed?: boolean
          last_input?: string | null
          order_id?: string | null
          origin: string
          sessionid: string
          shortcode?: string | null
          state?: Json
          step?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_closed?: boolean
          last_input?: string | null
          order_id?: string | null
          origin?: string
          sessionid?: string
          shortcode?: string | null
          state?: Json
          step?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ussd_sessions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      verified_phones: {
        Row: {
          created_at: string
          id: string
          last_login_at: string | null
          phone_number: string
          verification_code: string | null
          verified_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number: string
          verification_code?: string | null
          verified_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_login_at?: string | null
          phone_number?: string
          verification_code?: string | null
          verified_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_create_referral_code: { Args: { p_phone: string }; Returns: string }
      admin_delete_referral_code: {
        Args: { p_phone: string }
        Returns: boolean
      }
      admin_referral_overview: {
        Args: never
        Returns: {
          code: string
          created_at: string
          earnings: number
          phone: string
          points: number
          total_referrals: number
        }[]
      }
      admin_remove_admin: { Args: { p_user_id: string }; Returns: boolean }
      admin_reset_referral_points: {
        Args: { p_phone: string }
        Returns: boolean
      }
      apply_referral_code: {
        Args: { p_code: string; p_new_phone: string }
        Returns: Json
      }
      cancel_scheduled_order: {
        Args: { customer_phone_number: string; p_order_id: string }
        Returns: boolean
      }
      check_fraud_rules: {
        Args: { p_amount: number; p_receipt_id: string; p_sender_phone: string }
        Returns: Json
      }
      get_active_categories: {
        Args: { p_provider_id?: string }
        Returns: {
          category_image: string
          category_name: string
          display_order: number
          id: string
          is_active: boolean
          provider_id: string
        }[]
      }
      get_active_payment_providers: {
        Args: never
        Returns: {
          commission_rate: number
          display_order: number
          id: string
          is_active: boolean
          payment_number: string
          prefix_code: string
          provider_logo: string
          provider_name: string
          ussd_code_template: string
        }[]
      }
      get_active_providers: {
        Args: never
        Returns: {
          display_order: number
          evoucher_rate: number
          id: string
          is_active: boolean
          promotional_text: string
          provider_logo: string
          provider_name: string
        }[]
      }
      get_admin_analytics_summary: { Args: never; Returns: Json }
      get_admin_date_range_breakdown: {
        Args: { p_end_date?: string; p_start_date?: string }
        Returns: {
          day: string
          order_count: number
          profit: number
          revenue: number
        }[]
      }
      get_admin_provider_daily_stats: {
        Args: { p_date?: string }
        Returns: {
          day: string
          order_count: number
          profit: number
          provider_id: string
          provider_name: string
          revenue: number
        }[]
      }
      get_admin_reports: {
        Args: { p_end?: string; p_start?: string }
        Returns: Json
      }
      get_admin_transactions_paginated: {
        Args: {
          p_page?: number
          p_page_size?: number
          p_period?: string
          p_provider_id?: string
          p_search?: string
          p_status?: string
        }
        Returns: {
          cost_price: number
          created_at: string
          customer_phone: string
          data_amount: string
          delivery_status: string
          id: string
          package_name: string
          provider_id: string
          receiver_phone: string
          selling_price: number
          status: string
          total_count: number
          tx_id: string
        }[]
      }
      get_admin_transactions_summary: {
        Args: { p_period?: string; p_provider_id?: string }
        Returns: Json
      }
      get_customer_order_history: {
        Args: { customer_phone_number: string }
        Returns: {
          created_at: string
          data_amount: string
          delivered_at: string
          delivery_status: string
          id: string
          package_id: string
          package_name: string
          provider_id: string
          receiver_phone: string
          scheduled_for: string
          selling_price: number
          status: string
          tx_id: string
        }[]
      }
      get_customer_scheduled_orders: {
        Args: { customer_phone_number: string }
        Returns: {
          created_at: string
          data_amount: string
          id: string
          package_name: string
          receiver_phone: string
          scheduled_for: string
          selling_price: number
          status: string
        }[]
      }
      get_discovery_queue_status: { Args: { p_id: string }; Returns: Json }
      get_featured_packages: {
        Args: never
        Returns: {
          connection_type_label: string
          data_amount: string
          display_order: number
          package_id: string
          package_name: string
          provider_id: string
          provider_logo: string
          provider_name: string
          selling_price: number
        }[]
      }
      get_most_purchased_packages: {
        Args: never
        Returns: {
          connection_type_label: string
          data_amount: string
          package_id: string
          package_name: string
          provider_id: string
          provider_logo: string
          provider_name: string
          purchase_count: number
          selling_price: number
        }[]
      }
      get_my_admin_context: { Args: never; Returns: Json }
      get_my_referral_code: { Args: { p_phone: string }; Returns: string }
      get_package_discovery: { Args: { p_id: string }; Returns: Json }
      get_public_packages: {
        Args: { p_category_id?: string; p_provider_id?: string }
        Returns: {
          category_id: string
          connection_type_label: string
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          is_discovery_root: boolean
          is_ussd_only: boolean
          package_name: string
          phone_prefix: string
          provider_id: string
          selling_price: number
          validity_days: string
        }[]
      }
      get_public_packages_safe: {
        Args: { p_category_id?: string; p_provider_id?: string }
        Returns: {
          category_id: string
          connection_type_label: string
          data_amount: string
          display_order: number
          id: string
          is_active: boolean
          is_discovery_root: boolean
          is_ussd_only: boolean
          package_name: string
          phone_prefix: string
          provider_id: string
          selling_price: number
          validity_days: string
        }[]
      }
      get_referral_summary: { Args: { p_phone: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_phone_blocked: { Args: { p_phone: string }; Returns: boolean }
      release_discovery_session: { Args: { p_id: string }; Returns: boolean }
      request_package_discovery: {
        Args: { p_phone: string; p_root_package_id: string }
        Returns: Json
      }
      retry_failed_order: {
        Args: { p_new_receiver_phone: string; p_order_id: string }
        Returns: boolean
      }
      set_bank_credential: {
        Args: { p_password: string; p_username: string }
        Returns: boolean
      }
      upsert_verified_phone_login: {
        Args: { p_phone: string }
        Returns: undefined
      }
      ussd_normalize_label: { Args: { _label: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "super_admin" | "moderator" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "super_admin", "moderator", "user"],
    },
  },
} as const
