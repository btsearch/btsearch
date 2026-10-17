export default {
  officialDataUpdate: {
    title: "{source} data updated",
    body: "New {source} data is available",
  },
  submissionApproved: {
    title: "Submission approved",
    body: "Your submission has been approved",
  },
  submissionApprovalsGrouped: {
    title: "Submissions approved",
    body: "{count} submissions were approved",
  },
  submissionRejected: {
    title: "Submission rejected",
    body: "Your submission has been rejected",
  },
  submissionPhotoUploadFailed: {
    title: "Submission deleted because photos were not uploaded",
    body: "Your selected photos were not uploaded, so your submission was deleted",
  },
  newSubmission: {
    title: "New submission",
    body: "A new submission is waiting for review",
  },
  stationCellsChanged: {
    title: "Station cells changed",
    body: "A watched station has cell changes",
  },
  stationPhotosAdded: {
    title: "Station photos added",
    body: "A watched station has new photos",
  },
  stationCommentApproved: {
    title: "New station comment",
    body: "A watched station has a new comment",
  },
  stationOfficialPermitAdded: {
    title: "Station permits changed",
    body: "A watched station has permit changes",
  },
  labels: {
    station: "Station",
    submittedBy: "By",
    reviewerName: "Reviewed by",
    reviewerNote: "Note",
    cellsAdded: "Cells added",
    cellsRemoved: "Cells removed",
    cellsUpdated: "Cells updated",
    permitsAdded: "Permits added",
    permitsDeleted: "Permits removed",
    officialSitesAdded: "Register stations added",
    officialSiteDeleted: "Station removed from the register",
    count: "Count",
  },
} as const;
