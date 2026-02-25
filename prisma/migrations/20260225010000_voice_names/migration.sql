-- Convert ttsVoice from TtsVoice enum to plain String
-- Map MALE -> "Puck" (upbeat, game-show energy) and FEMALE -> "Aoede" (breezy, natural)
ALTER TABLE "Game" ALTER COLUMN "ttsVoice" TYPE TEXT USING
  CASE "ttsVoice"::TEXT
    WHEN 'MALE' THEN 'RANDOM'
    WHEN 'FEMALE' THEN 'RANDOM'
    ELSE 'RANDOM'
  END;

ALTER TABLE "Game" ALTER COLUMN "ttsVoice" SET DEFAULT 'RANDOM';

-- Drop the old enum
DROP TYPE "TtsVoice";
