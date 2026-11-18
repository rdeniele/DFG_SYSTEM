"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { compressImage } from "./image";

/**
 * Compress, upload to avatars/{profileId}/..., save photo_url on the profile.
 * Returns the public URL. Used by registration and by the admin "change photo".
 */
export async function uploadAvatar(supabase: SupabaseClient, profileId: string, file: File): Promise<string> {
  const blob = await compressImage(file);
  // New file name each time so phones don't show a cached old photo.
  const path = `${profileId}/avatar-${Date.now()}.jpg`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
  if (upErr) throw upErr;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  const { error: dbErr } = await supabase.from("profiles").update({ photo_url: data.publicUrl }).eq("id", profileId);
  if (dbErr) throw dbErr;
  return data.publicUrl;
}
