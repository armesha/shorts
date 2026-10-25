import test from "node:test";
import assert from "node:assert/strict";
import {isDefaultRegisteredUserPack,registeredUserDefaultGrantIds} from "./default-user-decks.ts";

test("registered user defaults classify Russian joke packs without installed content fixtures",()=>{
  assert.equal(isDefaultRegisteredUserPack({id:"custom-jokes-ru",name:"Russian jokes",lang:"ru",templateType:"jokes"}),true);
  assert.equal(isDefaultRegisteredUserPack({id:"custom-jokes-en",name:"English jokes",lang:"en",templateType:"jokes"}),false);
  assert.equal(isDefaultRegisteredUserPack({id:"custom-facts-ru",name:"Facts",lang:"ru",templateType:"facts"}),false);
  assert.equal(isDefaultRegisteredUserPack({id:"custom-memes-ru",name:"Memes",lang:"ru",templateType:"memes"}),false);
  assert.deepEqual(registeredUserDefaultGrantIds().deckIds,[]);
});
