export class MeetImportedEvent {
  constructor(
    public readonly importJobId: string,
    public readonly tournamentId: string,
  ) {}
}
