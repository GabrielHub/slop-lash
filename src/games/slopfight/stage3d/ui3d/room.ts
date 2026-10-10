"use client";

// The room, when the stage renders inside one. Scenes read the room view
// through the room context (bridged into the canvas). Dev labs without a room
// get null and must render something sensible.

export { useOptionalRoom as useRoomOrNull } from "@/room/context";
