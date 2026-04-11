type Champion = {
    name: string,
    title: string,
    generation?: string,
}

type Wrestler = {
    name: string,
    info?: string[]
}

type Section = {
    name: string,
    members: Wrestler[],
}

type Roster = {
    champions: Champion[],
    roster?: Wrestler[],
    sections?: Section[]
}