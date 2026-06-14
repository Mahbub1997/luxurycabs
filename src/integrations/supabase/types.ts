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
      bookings: {
        Row: {
          assigned_driver_id: string | null
          completed_at: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          distance_km: number
          driver_lat: number | null
          driver_lng: number | null
          driver_name: string | null
          driver_phone: string | null
          driver_photo: string | null
          driver_rating: number | null
          driver_trips: number | null
          drop_address: string
          drop_lat: number
          drop_lng: number
          duration_min: number
          fare: number
          id: string
          otp: string
          package_label: string | null
          payment_method: string
          payment_status: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          route_polyline: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["booking_status"]
          trip_mode: string | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at: string
          user_id: string | null
          vehicle_model: string | null
          vehicle_number: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Insert: {
          assigned_driver_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          distance_km?: number
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo?: string | null
          driver_rating?: number | null
          driver_trips?: number | null
          drop_address: string
          drop_lat: number
          drop_lng: number
          duration_min?: number
          fare?: number
          id?: string
          otp?: string
          package_label?: string | null
          payment_method?: string
          payment_status?: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          route_polyline?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          trip_mode?: string | null
          trip_type: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          user_id?: string | null
          vehicle_model?: string | null
          vehicle_number?: string | null
          vehicle_type: Database["public"]["Enums"]["vehicle_type"]
        }
        Update: {
          assigned_driver_id?: string | null
          completed_at?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          distance_km?: number
          driver_lat?: number | null
          driver_lng?: number | null
          driver_name?: string | null
          driver_phone?: string | null
          driver_photo?: string | null
          driver_rating?: number | null
          driver_trips?: number | null
          drop_address?: string
          drop_lat?: number
          drop_lng?: number
          duration_min?: number
          fare?: number
          id?: string
          otp?: string
          package_label?: string | null
          payment_method?: string
          payment_status?: string
          pickup_address?: string
          pickup_lat?: number
          pickup_lng?: number
          route_polyline?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          trip_mode?: string | null
          trip_type?: Database["public"]["Enums"]["trip_type"]
          updated_at?: string
          user_id?: string | null
          vehicle_model?: string | null
          vehicle_number?: string | null
          vehicle_type?: Database["public"]["Enums"]["vehicle_type"]
        }
        Relationships: [
          {
            foreignKeyName: "bookings_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          current_lat: number | null
          current_lng: number | null
          email: string | null
          id: string
          is_online: boolean
          license_number: string | null
          license_photo_url: string | null
          name: string
          phone: string
          photo: string | null
          rating: number | null
          selfie_url: string | null
          status: Database["public"]["Enums"]["driver_status"]
          total_trips: number
          updated_at: string
          user_id: string
          vehicle_model: string | null
          vehicle_number: string | null
          vehicle_type: string
          wallet_balance: number
        }
        Insert: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          id?: string
          is_online?: boolean
          license_number?: string | null
          license_photo_url?: string | null
          name: string
          phone: string
          photo?: string | null
          rating?: number | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          total_trips?: number
          updated_at?: string
          user_id: string
          vehicle_model?: string | null
          vehicle_number?: string | null
          vehicle_type?: string
          wallet_balance?: number
        }
        Update: {
          created_at?: string
          current_lat?: number | null
          current_lng?: number | null
          email?: string | null
          id?: string
          is_online?: boolean
          license_number?: string | null
          license_photo_url?: string | null
          name?: string
          phone?: string
          photo?: string | null
          rating?: number | null
          selfie_url?: string | null
          status?: Database["public"]["Enums"]["driver_status"]
          total_trips?: number
          updated_at?: string
          user_id?: string
          vehicle_model?: string | null
          vehicle_number?: string | null
          vehicle_type?: string
          wallet_balance?: number
        }
        Relationships: []
      }
      fare_config: {
        Row: {
          base_fare: number
          created_at: string
          id: string
          minimum_fare: number
          outstation_per_km: number
          per_km: number
          per_min: number
          trip_type: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          base_fare?: number
          created_at?: string
          id?: string
          minimum_fare?: number
          outstation_per_km?: number
          per_km?: number
          per_min?: number
          trip_type: string
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          base_fare?: number
          created_at?: string
          id?: string
          minimum_fare?: number
          outstation_per_km?: number
          per_km?: number
          per_min?: number
          trip_type?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      local_drop_fares: {
        Row: {
          base_fare: number
          created_at: string
          id: string
          is_above: boolean
          max_km: number
          notes: string | null
          per_km: number
          per_min: number
          total_fare: number
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          base_fare?: number
          created_at?: string
          id?: string
          is_above?: boolean
          max_km: number
          notes?: string | null
          per_km?: number
          per_min?: number
          total_fare?: number
          updated_at?: string
          vehicle_type?: string
        }
        Update: {
          base_fare?: number
          created_at?: string
          id?: string
          is_above?: boolean
          max_km?: number
          notes?: string | null
          per_km?: number
          per_min?: number
          total_fare?: number
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          requested_at: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          requested_at?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          requested_at?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          booking_id: string | null
          created_at: string
          driver_id: string
          id: string
          note: string | null
          type: Database["public"]["Enums"]["wallet_entry_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          booking_id?: string | null
          created_at?: string
          driver_id: string
          id?: string
          note?: string | null
          type: Database["public"]["Enums"]["wallet_entry_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          booking_id?: string | null
          created_at?: string
          driver_id?: string
          id?: string
          note?: string | null
          type?: Database["public"]["Enums"]["wallet_entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      withdrawal_requests: {
        Row: {
          amount: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          driver_id: string
          id: string
          note: string | null
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          driver_id?: string
          id?: string
          note?: string | null
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "driver" | "customer" | "super_admin"
      booking_status:
        | "pending"
        | "driver_assigned"
        | "driver_arrived"
        | "in_progress"
        | "completed"
        | "cancelled"
      driver_status: "pending" | "approved" | "suspended" | "rejected"
      trip_type: "local" | "outstation" | "rental"
      vehicle_type: "sedan" | "suv"
      wallet_entry_type:
        | "credit"
        | "debit"
        | "commission"
        | "topup"
        | "withdrawal"
      withdrawal_status: "pending" | "approved" | "rejected"
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
      app_role: ["admin", "driver", "customer", "super_admin"],
      booking_status: [
        "pending",
        "driver_assigned",
        "driver_arrived",
        "in_progress",
        "completed",
        "cancelled",
      ],
      driver_status: ["pending", "approved", "suspended", "rejected"],
      trip_type: ["local", "outstation", "rental"],
      vehicle_type: ["sedan", "suv"],
      wallet_entry_type: [
        "credit",
        "debit",
        "commission",
        "topup",
        "withdrawal",
      ],
      withdrawal_status: ["pending", "approved", "rejected"],
    },
  },
} as const
