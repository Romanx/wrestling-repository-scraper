def clean:
  walk(
    if type == "object" then
      (with_entries(
         select(.value != null and .value != "" and .value != [] and .value != {})
       )
       | to_entries | sort_by(.key) | from_entries)
    elif type == "array" then
      map(select(. != null and . != "" and . != [] and . != {}))
    else
      .
    end
  );

def sort_members:
  walk(
    if type == "object" and has("members") then
      .members |= sort_by(.name)
    else
      .
    end
  );

clean | sort_members