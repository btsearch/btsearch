export default {
  officialDataUpdate: {
    title: "Zaktualizowano dane {source}",
    body: "Dostępne są nowe dane z {source}",
  },
  submissionApproved: {
    title: "Zgłoszenie zatwierdzone",
    body: "Twoje zgłoszenie zostało zatwierdzone",
  },
  submissionApprovalsGrouped: {
    title: "Zatwierdzono zgłoszenia",
    body: "{count} zgłoszeń zostało zatwierdzonych",
  },
  submissionRejected: {
    title: "Zgłoszenie odrzucone",
    body: "Twoje zgłoszenie zostało odrzucone",
  },
  submissionPhotoUploadFailed: {
    title: "Zgłoszenie usunięte, ponieważ zdjęcia nie zostały przesłane",
    body: "Wybrane zdjęcia nie zostały przesłane, dlatego Twoje zgłoszenie zostało usunięte",
  },
  newSubmission: {
    title: "Nowe zgłoszenie",
    body: "Nowe zgłoszenie oczekuje na rozpatrzenie",
  },
  stationCellsChanged: {
    title: "Zmieniono komórki stacji",
    body: "Obserwowana stacja ma zmiany w komórkach",
  },
  stationPhotosAdded: {
    title: "Dodano zdjęcia stacji",
    body: "Obserwowana stacja ma nowe zdjęcia",
  },
  stationCommentApproved: {
    title: "Nowy komentarz na stacji",
    body: "Obserwowana stacja ma nowy komentarz",
  },
  stationOfficialPermitAdded: {
    title: "Zmieniono pozwolenia stacji",
    body: "Obserwowana stacja ma zmiany w pozwoleniach",
  },
  labels: {
    station: "Stacja",
    submittedBy: "Od",
    reviewerName: "Sprawdzający",
    reviewerNote: "Notatka",
    cellsAdded: "Dodane komórki",
    cellsRemoved: "Usunięte komórki",
    cellsUpdated: "Zmienione komórki",
    permitsAdded: "Dodane pozwolenia",
    permitsDeleted: "Usunięte pozwolenia",
    officialSitesAdded: "Dodane stacje z rejestru",
    officialSiteDeleted: "Stacja usunięta z rejestru",
    count: "Liczba",
  },
} as const;
