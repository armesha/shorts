import type { DatabaseSync } from "node:sqlite";
import type { Row } from "./mappers.ts";
import type { CreatorGalleryItem } from "./types.ts";

function rowToCreatorGalleryItem(row: Row): CreatorGalleryItem {
  return {
    id: Number(row.id),
    userId: Number(row.user_id),
    packId: String(row.pack_id ?? ""),
    packName: String(row.pack_name ?? ""),
    templateType: String(row.template_type ?? "custom"),
    cardIndex: Number(row.card_index) || 0,
    title: String(row.title ?? ""),
    text: String(row.text ?? ""),
    narration: row.narration == null ? null : String(row.narration),
    format: String(row.format ?? "mp4"),
    imageRel: row.image_rel == null ? null : String(row.image_rel),
    videoRel: row.video_rel == null ? null : String(row.video_rel),
    zipRel: row.zip_rel == null ? null : String(row.zip_rel),
    music: String(row.music ?? "none"),
    durationSec: row.duration_sec == null ? null : Number(row.duration_sec),
    createdAt: String(row.created_at ?? ""),
  };
}

export function creatorMethods(db: DatabaseSync) {
  return {
    createCreatorGalleryItem(input: {
      userId: number;
      packId: string;
      packName: string;
      templateType: string;
      cardIndex: number;
      title: string;
      text: string;
      narration?: string | null;
      format: string;
      imageRel?: string | null;
      videoRel?: string | null;
      zipRel?: string | null;
      music?: string;
      durationSec?: number | null;
    }): CreatorGalleryItem {
      const info = db
        .prepare(
          `INSERT INTO creator_gallery_items
             (user_id, pack_id, pack_name, template_type, card_index, title, text, narration, format,
              image_rel, video_rel, zip_rel, music, duration_sec)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          input.userId,
          input.packId,
          input.packName,
          input.templateType || "custom",
          input.cardIndex,
          input.title,
          input.text,
          input.narration ?? null,
          input.format,
          input.imageRel ?? null,
          input.videoRel ?? null,
          input.zipRel ?? null,
          input.music ?? "none",
          input.durationSec ?? null,
        );
      return this.getCreatorGalleryItem(Number(info.lastInsertRowid))!;
    },

    getCreatorGalleryItem(id: number): CreatorGalleryItem | null {
      const row = db.prepare("SELECT * FROM creator_gallery_items WHERE id = ?").get(id) as Row | undefined;
      return row ? rowToCreatorGalleryItem(row) : null;
    },

    listCreatorGalleryItems(userId: number): CreatorGalleryItem[] {
      return (
        db.prepare("SELECT * FROM creator_gallery_items WHERE user_id = ? ORDER BY id DESC").all(userId) as Row[]
      ).map(rowToCreatorGalleryItem);
    },

    findCreatorOutputFileOwner(rel: string): { userId: number } | null {
      const row = db
        .prepare(
          `SELECT user_id
             FROM creator_gallery_items
            WHERE image_rel = ? OR video_rel = ? OR zip_rel = ?
            LIMIT 1`,
        )
        .get(rel, rel, rel) as Row | undefined;
      return row ? { userId: Number(row.user_id) } : null;
    },
  };
}
