export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export type Database = {
  public: {
    Tables: {
      projects: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          accent_color: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          accent_color?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          title: string | null;
          guest_name: string | null;
          interviewer_name: string | null;
          status: string;
          error_message: string | null;
          audio_asset_id: string | null;
          transcript_id: string | null;
          memo_id: string | null;
          needs_review: boolean | null;
          source_type: string | null;
          capture_mode: string | null;
          live_transcript_snapshot: string | null;
          started_at: string | null;
          ended_at: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          title?: string | null;
          guest_name?: string | null;
          interviewer_name?: string | null;
          status?: string;
          error_message?: string | null;
          audio_asset_id?: string | null;
          transcript_id?: string | null;
          memo_id?: string | null;
          needs_review?: boolean | null;
          source_type?: string | null;
          capture_mode?: string | null;
          live_transcript_snapshot?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
        Relationships: [];
      };
      audio_assets: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type: string | null;
          duration_seconds: number | null;
          keep_source: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          storage_path: string;
          file_name: string;
          file_size: number;
          mime_type?: string | null;
          duration_seconds?: number | null;
          keep_source?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_assets"]["Row"]>;
        Relationships: [];
      };
      transcripts: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          transcript_text: string;
          raw: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          transcript_text: string;
          raw?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transcripts"]["Row"]>;
        Relationships: [];
      };
      memos: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          ic_qa_text: string | null;
          wechat_article_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          ic_qa_text?: string | null;
          wechat_article_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memos"]["Row"]>;
        Relationships: [];
      };
      artifacts: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          job_id: string | null;
          kind: string;
          title: string;
          content: string | null;
          summary: string | null;
          status: string;
          metadata: Json | null;
          audio_url: string | null;
          is_favorite: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          job_id?: string | null;
          kind: string;
          title: string;
          content?: string | null;
          summary?: string | null;
          status?: string;
          metadata?: Json | null;
          audio_url?: string | null;
          is_favorite?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["artifacts"]["Row"]>;
        Relationships: [];
      };
      favorites: {
        Row: {
          id: string;
          user_id: string;
          project_id: string | null;
          job_id: string | null;
          artifact_id: string | null;
          item_type: string;
          label: string | null;
          excerpt: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id?: string | null;
          job_id?: string | null;
          artifact_id?: string | null;
          item_type: string;
          label?: string | null;
          excerpt?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["favorites"]["Row"]>;
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          user_id: string;
          project_id: string;
          job_id: string | null;
          source_type: string;
          title: string | null;
          url: string | null;
          domain: string | null;
          raw_text: string | null;
          extracted_text: string | null;
          status: string;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          project_id: string;
          job_id?: string | null;
          source_type?: string;
          title?: string | null;
          url?: string | null;
          domain?: string | null;
          raw_text?: string | null;
          extracted_text?: string | null;
          status?: string;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sources"]["Row"]>;
        Relationships: [];
      };
      glossary_terms: {
        Row: {
          id: string;
          user_id: string;
          term: string;
          normalized_term: string | null;
          source: string | null;
          metadata: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          term: string;
          normalized_term?: string | null;
          source?: string | null;
          metadata?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["glossary_terms"]["Row"]>;
        Relationships: [];
      };
      term_occurrences: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          term_id: string | null;
          term_text: string;
          start_offset: number | null;
          end_offset: number | null;
          context: string | null;
          confidence: number | null;
          status: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          term_id?: string | null;
          term_text: string;
          start_offset?: number | null;
          end_offset?: number | null;
          context?: string | null;
          confidence?: number | null;
          status?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["term_occurrences"]["Row"]>;
        Relationships: [];
      };
      confirmations: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          term_text: string;
          confirmed_text: string | null;
          action: string;
          source: string | null;
          context: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          term_text: string;
          confirmed_text?: string | null;
          action: string;
          source?: string | null;
          context?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["confirmations"]["Row"]>;
        Relationships: [];
      };
      credits_ledger: {
        Row: {
          id: string;
          user_id: string;
          job_id: string | null;
          action: string;
          amount: number;
          unit: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          job_id?: string | null;
          action: string;
          amount: number;
          unit: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["credits_ledger"]["Row"]>;
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          status: string | null;
          plan: string | null;
          current_period_end: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          status?: string | null;
          plan?: string | null;
          current_period_end?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["subscriptions"]["Row"]>;
        Relationships: [];
      };
      usage_counters: {
        Row: {
          id: string;
          user_id: string;
          period_start: string;
          period_end: string;
          minutes_used: number | null;
          files_used: number | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          period_start: string;
          period_end: string;
          minutes_used?: number | null;
          files_used?: number | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["usage_counters"]["Row"]>;
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          payload?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
