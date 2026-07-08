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
      activity_logs: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          id: string
          ip_address: string | null
          resource_id: string | null
          resource_type: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id: string
          user_role: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          id?: string
          ip_address?: string | null
          resource_id?: string | null
          resource_type?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: []
      }
      ai_provider_settings: {
        Row: {
          api_key: string
          base_url: string
          created_at: string
          extra_headers: Json | null
          id: string
          is_active: boolean
          is_fallback: boolean
          last_test_at: string | null
          last_test_error: string | null
          last_test_latency_ms: number | null
          last_test_sample: string | null
          last_test_status: string | null
          model: string
          notes: string | null
          priority: number
          provider_name: string
          scope: string
          updated_at: string
        }
        Insert: {
          api_key: string
          base_url: string
          created_at?: string
          extra_headers?: Json | null
          id?: string
          is_active?: boolean
          is_fallback?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_sample?: string | null
          last_test_status?: string | null
          model: string
          notes?: string | null
          priority?: number
          provider_name: string
          scope: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          base_url?: string
          created_at?: string
          extra_headers?: Json | null
          id?: string
          is_active?: boolean
          is_fallback?: boolean
          last_test_at?: string | null
          last_test_error?: string | null
          last_test_latency_ms?: number | null
          last_test_sample?: string | null
          last_test_status?: string | null
          model?: string
          notes?: string | null
          priority?: number
          provider_name?: string
          scope?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_usage_counter: {
        Row: {
          month: string
          monthly_limit: number
          updated_at: string
          used_count: number
        }
        Insert: {
          month: string
          monthly_limit?: number
          updated_at?: string
          used_count?: number
        }
        Update: {
          month?: string
          monthly_limit?: number
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          browser: string | null
          city: string | null
          client_id: string | null
          country: string | null
          created_at: string
          currency: string | null
          device_type: string | null
          event_name: string
          id: string
          ip_address: string | null
          metadata: Json | null
          os: string | null
          page_path: string | null
          page_title: string | null
          referrer: string | null
          session_id: string | null
          user_agent: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
          value: number | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          value?: number | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          client_id?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          device_type?: string | null
          event_name?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          os?: string | null
          page_path?: string | null
          page_title?: string | null
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          value?: number | null
        }
        Relationships: []
      }
      back_in_stock_alerts: {
        Row: {
          created_at: string
          email: string
          id: string
          notified: boolean
          product_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          notified?: boolean
          product_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          notified?: boolean
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "back_in_stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      backup_history: {
        Row: {
          backup_name: string
          backup_type: string
          created_at: string
          created_by: string | null
          file_path: string | null
          file_size_bytes: number | null
          id: string
          notes: string | null
          status: string
          tables_included: string[]
        }
        Insert: {
          backup_name: string
          backup_type?: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          status?: string
          tables_included?: string[]
        }
        Update: {
          backup_name?: string
          backup_type?: string
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          file_size_bytes?: number | null
          id?: string
          notes?: string | null
          status?: string
          tables_included?: string[]
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_by: string | null
          created_at: string
          id: string
          is_active: boolean
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_name: string | null
          category: string
          content: string | null
          created_at: string
          excerpt: string | null
          id: string
          image_url: string | null
          is_published: boolean
          published_at: string | null
          read_time: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_name?: string | null
          category?: string
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string | null
          read_time?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_name?: string | null
          category?: string
          content?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          published_at?: string | null
          read_time?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bundle_deals: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          is_active: boolean
          min_items: number
          name: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          min_items?: number
          name: string
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          is_active?: boolean
          min_items?: number
          name?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          color: string | null
          created_at: string
          id: string
          product_id: string
          quantity: number
          size: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          size?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          size?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          description_bn: string | null
          display_order: number | null
          id: string
          image_url: string | null
          is_active: boolean | null
          item_count: string | null
          name: string
          name_bn: string | null
          slug: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_bn?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_count?: string | null
          name: string
          name_bn?: string | null
          slug?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          description_bn?: string | null
          display_order?: number | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          item_count?: string | null
          name?: string
          name_bn?: string | null
          slug?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      chat_histories: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          messages: Json
          order_id: string | null
          order_status: string | null
          order_total: number | null
          products_discussed: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          messages?: Json
          order_id?: string | null
          order_status?: string | null
          order_total?: number | null
          products_discussed?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          messages?: Json
          order_id?: string | null
          order_status?: string | null
          order_total?: number | null
          products_discussed?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_histories_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_uploads: {
        Row: {
          created_at: string
          deleted: boolean
          deleted_at: string | null
          expires_at: string
          id: string
          ip_address: string | null
          mime_type: string | null
          public_url: string
          session_key: string | null
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          mime_type?: string | null
          public_url: string
          session_key?: string | null
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          created_at?: string
          deleted?: boolean
          deleted_at?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          mime_type?: string | null
          public_url?: string
          session_key?: string | null
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: []
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          current_uses: number
          description: string | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_uses: number | null
          minimum_order_amount: number | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          code: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          minimum_order_amount?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          current_uses?: number
          description?: string | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_uses?: number | null
          minimum_order_amount?: number | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      courier_audit_logs: {
        Row: {
          action: string
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          error_message: string | null
          id: string
          order_id: string | null
          shipment_id: string | null
          success: boolean
        }
        Insert: {
          action: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          order_id?: string | null
          shipment_id?: string | null
          success?: boolean
        }
        Update: {
          action?: string
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          error_message?: string | null
          id?: string
          order_id?: string | null
          shipment_id?: string | null
          success?: boolean
        }
        Relationships: []
      }
      courier_shipments: {
        Row: {
          admin_approved: boolean
          approved_at: string | null
          approved_by: string | null
          cod_amount: number
          cod_paid_amount: number
          cod_payment_status: string
          cod_settled_at: string | null
          consignment_id: string | null
          courier: string
          created_at: string
          delivery_status: string | null
          error_message: string | null
          id: string
          invoice: string | null
          last_synced_at: string | null
          note: string | null
          notifications_sent: Json
          order_id: string
          raw_response: Json | null
          recipient_address: string
          recipient_name: string
          recipient_phone: string
          status: string
          submitted_at: string | null
          tracking_code: string | null
          updated_at: string
        }
        Insert: {
          admin_approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cod_amount?: number
          cod_paid_amount?: number
          cod_payment_status?: string
          cod_settled_at?: string | null
          consignment_id?: string | null
          courier?: string
          created_at?: string
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          invoice?: string | null
          last_synced_at?: string | null
          note?: string | null
          notifications_sent?: Json
          order_id: string
          raw_response?: Json | null
          recipient_address: string
          recipient_name: string
          recipient_phone: string
          status?: string
          submitted_at?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Update: {
          admin_approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          cod_amount?: number
          cod_paid_amount?: number
          cod_payment_status?: string
          cod_settled_at?: string | null
          consignment_id?: string | null
          courier?: string
          created_at?: string
          delivery_status?: string | null
          error_message?: string | null
          id?: string
          invoice?: string | null
          last_synced_at?: string | null
          note?: string | null
          notifications_sent?: Json
          order_id?: string
          raw_response?: Json | null
          recipient_address?: string
          recipient_name?: string
          recipient_phone?: string
          status?: string
          submitted_at?: string | null
          tracking_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      csp_reports: {
        Row: {
          blocked_uri: string | null
          column_number: number | null
          created_at: string
          document_uri: string | null
          effective_directive: string | null
          id: string
          line_number: number | null
          original_policy: string | null
          raw: Json | null
          referrer: string | null
          source_file: string | null
          status_code: number | null
          user_agent: string | null
          violated_directive: string | null
        }
        Insert: {
          blocked_uri?: string | null
          column_number?: number | null
          created_at?: string
          document_uri?: string | null
          effective_directive?: string | null
          id?: string
          line_number?: number | null
          original_policy?: string | null
          raw?: Json | null
          referrer?: string | null
          source_file?: string | null
          status_code?: number | null
          user_agent?: string | null
          violated_directive?: string | null
        }
        Update: {
          blocked_uri?: string | null
          column_number?: number | null
          created_at?: string
          document_uri?: string | null
          effective_directive?: string | null
          id?: string
          line_number?: number | null
          original_policy?: string | null
          raw?: Json | null
          referrer?: string | null
          source_file?: string | null
          status_code?: number | null
          user_agent?: string | null
          violated_directive?: string | null
        }
        Relationships: []
      }
      customer_segment_members: {
        Row: {
          added_at: string
          id: string
          segment_id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          id?: string
          segment_id: string
          user_id: string
        }
        Update: {
          added_at?: string
          id?: string
          segment_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_segment_members_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "customer_segments"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          created_at: string
          criteria: Json
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          criteria?: Json
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      delivery_zones: {
        Row: {
          areas: string[] | null
          city: string
          created_at: string
          estimated_days: number | null
          id: string
          is_active: boolean
          shipping_charge: number
          updated_at: string
          zone_name: string
        }
        Insert: {
          areas?: string[] | null
          city: string
          created_at?: string
          estimated_days?: number | null
          id?: string
          is_active?: boolean
          shipping_charge?: number
          updated_at?: string
          zone_name: string
        }
        Update: {
          areas?: string[] | null
          city?: string
          created_at?: string
          estimated_days?: number | null
          id?: string
          is_active?: boolean
          shipping_charge?: number
          updated_at?: string
          zone_name?: string
        }
        Relationships: []
      }
      email_campaigns: {
        Row: {
          content: string
          created_at: string
          id: string
          sent_at: string | null
          sent_count: number | null
          status: string
          subject: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sent_at?: string | null
          sent_count?: number | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      injection_block_log: {
        Row: {
          actor: string | null
          created_at: string
          id: string
          matched_pattern: string | null
          metadata: Json | null
          payload_excerpt: string | null
          reason: string
          source: string
        }
        Insert: {
          actor?: string | null
          created_at?: string
          id?: string
          matched_pattern?: string | null
          metadata?: Json | null
          payload_excerpt?: string | null
          reason: string
          source: string
        }
        Update: {
          actor?: string | null
          created_at?: string
          id?: string
          matched_pattern?: string | null
          metadata?: Json | null
          payload_excerpt?: string | null
          reason?: string
          source?: string
        }
        Relationships: []
      }
      inventory_sync_audit_log: {
        Row: {
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip: string | null
          method: string
          payload: Json | null
          product_id: string | null
          record_count: number | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip?: string | null
          method: string
          payload?: Json | null
          product_id?: string | null
          record_count?: number | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip?: string | null
          method?: string
          payload?: Json | null
          product_id?: string | null
          record_count?: number | null
          status_code?: number | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          source: string | null
          subscribed: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          source?: string | null
          subscribed?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          source?: string | null
          subscribed?: boolean
        }
        Relationships: []
      }
      order_items: {
        Row: {
          color: string | null
          id: string
          order_id: string
          price: number
          product_id: string | null
          product_name: string
          quantity: number
          size: string | null
        }
        Insert: {
          color?: string | null
          id?: string
          order_id: string
          price: number
          product_id?: string | null
          product_name: string
          quantity: number
          size?: string | null
        }
        Update: {
          color?: string | null
          id?: string
          order_id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          size?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          advance_amount: number | null
          cod_collected: boolean | null
          cod_collected_at: string | null
          coupon_id: string | null
          courier_name: string | null
          created_at: string
          discount_amount: number | null
          due_amount: number | null
          estimated_delivery: string | null
          guest_email: string | null
          guest_name: string | null
          id: string
          is_guest: boolean | null
          notes: string | null
          payment_method: string
          payment_phone: string | null
          payment_status: string
          payment_verified: boolean | null
          payment_verified_at: string | null
          points_discount: number | null
          points_used: number | null
          shipping_address: string
          shipping_city: string
          shipping_phone: string
          status: string
          total: number
          tracking_number: string | null
          transaction_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          advance_amount?: number | null
          cod_collected?: boolean | null
          cod_collected_at?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number | null
          due_amount?: number | null
          estimated_delivery?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          is_guest?: boolean | null
          notes?: string | null
          payment_method?: string
          payment_phone?: string | null
          payment_status?: string
          payment_verified?: boolean | null
          payment_verified_at?: string | null
          points_discount?: number | null
          points_used?: number | null
          shipping_address: string
          shipping_city: string
          shipping_phone: string
          status?: string
          total: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          advance_amount?: number | null
          cod_collected?: boolean | null
          cod_collected_at?: string | null
          coupon_id?: string | null
          courier_name?: string | null
          created_at?: string
          discount_amount?: number | null
          due_amount?: number | null
          estimated_delivery?: string | null
          guest_email?: string | null
          guest_name?: string | null
          id?: string
          is_guest?: boolean | null
          notes?: string | null
          payment_method?: string
          payment_phone?: string | null
          payment_status?: string
          payment_verified?: boolean | null
          payment_verified_at?: string | null
          points_discount?: number | null
          points_used?: number | null
          shipping_address?: string
          shipping_city?: string
          shipping_phone?: string
          status?: string
          total?: number
          tracking_number?: string | null
          transaction_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      price_drop_alerts: {
        Row: {
          created_at: string
          id: string
          notified: boolean
          product_id: string
          target_price: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified?: boolean
          product_id: string
          target_price?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notified?: boolean
          product_id?: string
          target_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_drop_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_edit_audit: {
        Row: {
          admin_email: string | null
          admin_id: string | null
          created_at: string
          field: string
          id: string
          new_value: string | null
          old_value: string | null
          product_id: string
          source: string
        }
        Insert: {
          admin_email?: string | null
          admin_id?: string | null
          created_at?: string
          field: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id: string
          source?: string
        }
        Update: {
          admin_email?: string | null
          admin_id?: string | null
          created_at?: string
          field?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          product_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_edit_audit_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          product_id: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          product_id: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          product_id: string
          rating: number
          title: string | null
          updated_at: string
          user_id: string
          verified_purchase: boolean
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id: string
          rating: number
          title?: string | null
          updated_at?: string
          user_id: string
          verified_purchase?: boolean
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          product_id?: string
          rating?: number
          title?: string | null
          updated_at?: string
          user_id?: string
          verified_purchase?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          image_url: string | null
          image_urls: string[]
          price_adjustment: number | null
          product_id: string
          size: string | null
          sku: string | null
          stock: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[]
          price_adjustment?: number | null
          product_id: string
          size?: string | null
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          image_urls?: string[]
          price_adjustment?: number | null
          product_id?: string
          size?: string | null
          sku?: string | null
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          colors: string[] | null
          created_at: string
          description: string | null
          featured: boolean | null
          id: string
          image_url: string | null
          material: string | null
          name: string
          price: number
          sale_price: number | null
          sizes: string[] | null
          slug: string | null
          stock: number | null
          updated_at: string
          video_url: string | null
        }
        Insert: {
          category: string
          colors?: string[] | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          material?: string | null
          name: string
          price: number
          sale_price?: number | null
          sizes?: string[] | null
          slug?: string | null
          stock?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          category?: string
          colors?: string[] | null
          created_at?: string
          description?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          material?: string | null
          name?: string
          price?: number
          sale_price?: number | null
          sizes?: string[] | null
          slug?: string | null
          stock?: number | null
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          discount_percent: number
          id: string
          is_used: boolean
          referral_code: string
          referred_user_id: string | null
          referrer_id: string
        }
        Insert: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_used?: boolean
          referral_code: string
          referred_user_id?: string | null
          referrer_id: string
        }
        Update: {
          created_at?: string
          discount_percent?: number
          id?: string
          is_used?: boolean
          referral_code?: string
          referred_user_id?: string | null
          referrer_id?: string
        }
        Relationships: []
      }
      returns: {
        Row: {
          admin_notes: string | null
          created_at: string
          id: string
          order_id: string
          reason: string
          refund_amount: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          order_id: string
          reason: string
          refund_amount?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          created_at?: string
          id?: string
          order_id?: string
          reason?: string
          refund_amount?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_points: {
        Row: {
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          points: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          points?: number
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_points_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_addresses: {
        Row: {
          address: string
          city: string
          created_at: string
          district: string | null
          full_name: string
          id: string
          is_default: boolean
          label: string
          phone: string
          postal_code: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          city: string
          created_at?: string
          district?: string | null
          full_name: string
          id?: string
          is_default?: boolean
          label?: string
          phone: string
          postal_code?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          district?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          label?: string
          phone?: string
          postal_code?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_scan_reports: {
        Row: {
          created_at: string
          critical_count: number
          duration_ms: number | null
          findings: Json
          id: string
          status: string
          total_findings: number
          triggered_by: string
          triggered_user: string | null
        }
        Insert: {
          created_at?: string
          critical_count?: number
          duration_ms?: number | null
          findings?: Json
          id?: string
          status?: string
          total_findings?: number
          triggered_by?: string
          triggered_user?: string | null
        }
        Update: {
          created_at?: string
          critical_count?: number
          duration_ms?: number | null
          findings?: Json
          id?: string
          status?: string
          total_findings?: number
          triggered_by?: string
          triggered_user?: string | null
        }
        Relationships: []
      }
      security_scan_settings: {
        Row: {
          alerts: Json
          csp_retention_days: number
          environment: string
          id: string
          rules: Json
          scan_retention_days: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alerts?: Json
          csp_retention_days?: number
          environment?: string
          id?: string
          rules?: Json
          scan_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alerts?: Json
          csp_retention_days?: number
          environment?: string
          id?: string
          rules?: Json
          scan_retention_days?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      site_content: {
        Row: {
          content: string | null
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          section_key: string
          subtitle: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          section_key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          section_key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      social_proof_messages: {
        Row: {
          city: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          message: string
          product_name: string
          time_ago: string
          updated_at: string
        }
        Insert: {
          city?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          message: string
          product_name: string
          time_ago?: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          message?: string
          product_name?: string
          time_ago?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          permission: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          permission?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
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
          role: Database["public"]["Enums"]["app_role"]
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
      wishlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_security_data: {
        Args: never
        Returns: {
          block_deleted: number
          csp_deleted: number
          scan_deleted: number
        }[]
      }
      detect_injection: { Args: { input: string }; Returns: string }
      get_active_ai_provider: {
        Args: { _scope: string }
        Returns: {
          api_key: string
          base_url: string
          extra_headers: Json
          model: string
          provider_name: string
        }[]
      }
      get_ai_providers_for_scope: {
        Args: { _scope: string }
        Returns: {
          api_key: string
          base_url: string
          extra_headers: Json
          is_active: boolean
          is_fallback: boolean
          model: string
          priority: number
          provider_name: string
        }[]
      }
      get_ai_usage: {
        Args: never
        Returns: {
          month: string
          monthly_limit: number
          used_count: number
        }[]
      }
      has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_ai_usage: { Args: never; Returns: undefined }
      list_ai_providers: {
        Args: never
        Returns: {
          api_key_masked: string
          base_url: string
          extra_headers: Json
          id: string
          is_active: boolean
          is_fallback: boolean
          last_test_at: string
          last_test_error: string
          last_test_latency_ms: number
          last_test_sample: string
          last_test_status: string
          model: string
          notes: string
          priority: number
          provider_name: string
          scope: string
        }[]
      }
      sanitize_html_content: { Args: { input: string }; Returns: string }
      track_order_by_id: {
        Args: { order_id: string }
        Returns: {
          courier_name: string
          created_at: string
          discount_amount: number
          estimated_delivery: string
          id: string
          payment_method: string
          payment_status: string
          shipping_address: string
          shipping_city: string
          shipping_phone: string
          status: string
          total: number
          tracking_number: string
          updated_at: string
        }[]
      }
      track_order_by_phone: {
        Args: { phone_number: string }
        Returns: {
          courier_name: string
          created_at: string
          discount_amount: number
          estimated_delivery: string
          id: string
          payment_method: string
          payment_status: string
          shipping_address: string
          shipping_city: string
          shipping_phone: string
          status: string
          total: number
          tracking_number: string
          updated_at: string
        }[]
      }
      track_order_items: {
        Args: { p_order_id: string }
        Returns: {
          color: string
          id: string
          price: number
          product_id: string
          product_name: string
          quantity: number
          size: string
        }[]
      }
    }
    Enums: {
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
