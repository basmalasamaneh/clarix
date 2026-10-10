import type {Preferences} from "@workspace/api-client-react";
export function remainingPreferences(wanted:Preferences,next:Preferences,revision:number,acknowledged:number|undefined):Preferences{
  const remaining:Preferences={};
  for(const key of ["language","theme","tourCompleted"] as const){
    const value=wanted[key];
    // Equal values do not prove equal requests: preserve final A in A→B→A.
    if(value!==undefined&&(revision!==acknowledged||next[key]!==value))
      Object.assign(remaining,{[key]:value});
  }
  return remaining;
}
