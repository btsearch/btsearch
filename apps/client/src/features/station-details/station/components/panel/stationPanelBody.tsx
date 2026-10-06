import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect } from "react";

import { AddCommentForm } from "../../../components/addCommentForm";
import { CommentsList } from "../../../components/commentsList";
import { PhotoGallery } from "../../../components/photoGallery";
import { StationDetailsError } from "../../../components/stationDetailsError";
import { TAB_OPTIONS, type TabId } from "../../../tabs";
import { stationPhotoRecordsQueryOptions } from "../../api";
import { COMMENTS_OFF, stationCommentsQueryOptions } from "../../comments/api";
import type { StationRecord } from "../../types";
import { StationCellTables } from "../cells/stationCellTables";
import { StationOverviewCard } from "../overview/stationOverviewCard";
import { OtherLocationPhotos } from "../photos/otherLocationPhotos";
import { StationSectorsTab } from "../sectors/stationSectorsTab";
import { StationBodySkeleton } from "./stationBodySkeleton";
import { StationTabBar } from "./stationTabBar";
import { StaleDataNotice } from "@/components/ui/error-state";
import { useSettings } from "@/hooks/useSettings";
import { useSettledSession } from "@/hooks/useSettledSession";
import { cn } from "@/lib/utils";

type StationPanelBodyProps = {
  stationId: number;
  station?: StationRecord;
  isLoading: boolean;
  error: unknown;
  onRetry: () => unknown;
  isRetrying: boolean;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  onClose: () => void;
  canEditStation: boolean;
  onContentLayoutChange?: () => void;
};

export function StationPanelBody({
  stationId,
  station,
  isLoading,
  error,
  onRetry,
  isRetrying,
  activeTab,
  onTabChange,
  onClose,
  canEditStation,
  onContentLayoutChange,
}: StationPanelBodyProps) {
  const { data: settings } = useSettings();
  const { data: session } = useSettledSession();
  const currentUserId = session?.user?.id;
  const hasSectors = station !== undefined && station.sectors.length > 0;
  const showComments = settings?.features.comments === true;
  const showPhotos = settings?.features.photoUploads === true;
  const shownTab: TabId = activeTab === "sectors" && !hasSectors ? "specs" : activeTab;

  const { data: photos } = useQuery({ ...stationPhotoRecordsQueryOptions(stationId), enabled: showPhotos });

  const {
    data: comments,
    isLoading: isCommentsLoading,
    isLoadingError: isCommentsLoadError,
  } = useQuery({ ...stationCommentsQueryOptions(stationId, currentUserId), enabled: showComments });

  const photoCount = photos?.length;
  const commentCount = comments?.length;

  useLayoutEffect(() => {
    onContentLayoutChange?.();
  }, [shownTab, station?.id, photoCount, commentCount, onContentLayoutChange]);

  const visibleTabs = TAB_OPTIONS.filter((tab) => {
    if (tab.id === "sectors") return hasSectors;
    if (tab.id === "comments") return showComments;
    if (tab.id === "photos") return showPhotos;
    return true;
  });

  if (isLoading) return <StationBodySkeleton tabCount={visibleTabs.length} showInfoCard={shownTab === "specs"} />;
  if (!station) return error ? <StationDetailsError error={error} onRetry={onRetry} isRetrying={isRetrying} onClose={onClose} /> : null;

  const hasComments = commentCount !== undefined && commentCount > 0;
  const isCommentFormHidden = shownTab !== "comments" || isCommentsLoading || isCommentsLoadError || comments === COMMENTS_OFF;

  return (
    <div className="px-3 py-4 space-y-6 sm:p-6 sm:space-y-8">
      {error ? (
        <div className="mb-3 flex justify-center">
          <StaleDataNotice onRetry={onRetry} isRetrying={isRetrying} />
        </div>
      ) : null}
      <StationTabBar
        tabs={visibleTabs}
        activeTab={shownTab}
        counts={{ sectors: station.sectors.length, comments: commentCount, photos: photoCount }}
        onTabChange={onTabChange}
      />
      <div>
        {shownTab === "specs" ? (
          <div className="space-y-8">
            <StationOverviewCard station={station} onClose={onClose} />
            <StationCellTables station={station} />
          </div>
        ) : null}
        {shownTab === "sectors" ? <StationSectorsTab station={station} /> : null}
        {shownTab === "comments" ? (
          <section>
            <CommentsList stationId={stationId} canModerate={canEditStation} />
          </section>
        ) : null}
        {showComments && session?.user ? (
          <div className={cn("mt-5", hasComments && "border-t border-border/60 pt-5", isCommentFormHidden && "hidden")}>
            <AddCommentForm key={`${stationId}:${currentUserId}`} stationId={stationId} />
          </div>
        ) : null}
        {shownTab === "photos" ? (
          <>
            <section>
              <PhotoGallery stationId={stationId} canEditStation={canEditStation} />
            </section>
            <OtherLocationPhotos station={station} />
          </>
        ) : null}
      </div>
    </div>
  );
}
