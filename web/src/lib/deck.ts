import { useEffect, useState } from "react";

const KEY = "deckId";

/** Remembered pack/deck choice (ru | de | it), persisted in localStorage so it's not re-picked each time. */
export function useDeck(): [string, (d: string) => void] {
  const [deck, setDeck] = useState<string>(() => localStorage.getItem(KEY) || "ru");
  useEffect(() => {
    localStorage.setItem(KEY, deck);
  }, [deck]);
  return [deck, setDeck];
}
