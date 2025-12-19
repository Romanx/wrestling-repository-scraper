# Wrestling Roster Scraper

Kickstarted from [@simonw's](https://github.com/simonw): [shot-scraper-template](https://github.com/simonw/shot-scraper-template/blob/main/README.md)

I noticed that people were often watching the wrestling roster pages for changes and then reporting on it.
The idea that people did things we could get machines to do for us felt absurd.

After reading a blogpost by [@simonw's](https://github.com/simonw) I decided to use his [shot-scraper](https://shot-scraper.datasette.io/en/stable/) tool to help me parsing the roster pages.

## Rosters

- **AEW** Roster | [here.](rosters/aew-roster.json)
- **TNA** Roster | [here.](rosters/tna-roster.json)
- **WWE** Roster | [here.](rosters/wwe-roster.json)

This will be scraped periodically and changes will be committed to the repository.
I've tried to make the code deterministic so that it shouldn't change unless there's been an actual change.

Note: If stuff changes on the websites this might break. I'll try to fix it but no promises.

## Licence
The files in this repo are under the `GNU GENERAL PUBLIC LICENSE`. Basically go ahead and use them for whatever as long as it's in the public.
