export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      jobs: {
        Row: {
          id: string;
          user_id: string;
          title: string | null;
          status: string;
          error_message: string | null;
          audio_asset_id: string | null;
          transcript_id: string | null;
          memo_id: string | null;
          needs_review: boolean | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string | null;
          status?: string;
          error_message?: string | null;
          audio_asset_id?: string | null;
          transcript_id?: string | null;
          memo_id?: string | null;
          needs_review?: boolean | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["jobs"]["Row"]>;
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
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audio_assets"]["Row"]>;
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
      };
    };
  };
};

