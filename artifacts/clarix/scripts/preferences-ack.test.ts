import {test} from "node:test";
import assert from "node:assert/strict";
import {remainingPreferences} from "../src/lib/preference-ack";
test("older preference responses cannot acknowledge newer same-value intent",()=>{
  assert.deepEqual(remainingPreferences({language:"ar"},{language:"ar"},3,1),{language:"ar"});
  assert.deepEqual(remainingPreferences({language:"ar"},{language:"en"},3,2),{language:"ar"});
  assert.deepEqual(remainingPreferences({language:"ar"},{language:"ar"},3,3),{});
});
test("mixed preferences retain unacknowledged fields and preserve explicit false",()=>{
  const wanted={language:"ar" as const,theme:"dark" as const,tourCompleted:false};
  assert.deepEqual(remainingPreferences(wanted,{language:"ar",theme:"dark",tourCompleted:false},2,1),wanted);
  assert.deepEqual(remainingPreferences(wanted,{language:"ar",theme:"light",tourCompleted:false},2,2),{theme:"dark"});
});
