-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "SiteSourceType" AS ENUM ('MANUAL', 'SITEMAP', 'CRAWL', 'CMS');

-- CreateEnum
CREATE TYPE "SiteCrawlStatus" AS ENUM ('IDLE', 'QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PageLifecycleStatus" AS ENUM ('DISCOVERED', 'ACTIVE', 'DRAFT_ONLY', 'ARCHIVED', 'ERROR');

-- CreateEnum
CREATE TYPE "PageSourceStatus" AS ENUM ('CRAWLED', 'IMPORTED', 'MANUAL', 'GENERATED');

-- CreateEnum
CREATE TYPE "PageVersionState" AS ENUM ('LIVE_SNAPSHOT', 'DRAFT', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "PageVersionSource" AS ENUM ('CRAWL', 'MANUAL', 'AI_DRAFT', 'IMPORT', 'CMS_PUBLISH');

-- CreateEnum
CREATE TYPE "ScanTriggerType" AS ENUM ('INITIAL_INGEST', 'MANUAL_RESCAN', 'POST_PUBLISH_VERIFY', 'SCHEDULED_RESCAN');

-- CreateEnum
CREATE TYPE "ScanRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FindingType" AS ENUM ('BLOCKER', 'WARNING', 'STRENGTH', 'ENTITY_GAP', 'LINK_GAP', 'FRESHNESS_GAP', 'EXTRACTABILITY_GAP', 'CONVERSION_GAP', 'AUTHORITY_GAP');

-- CreateEnum
CREATE TYPE "RecommendationType" AS ENUM ('QUICK_WIN', 'STRUCTURAL_CHANGE', 'AUTHORITY_PROJECT', 'REWRITE_REQUIRED', 'NEW_PAGE_NEEDED');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'LINKED_TO_DRAFT', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "RecommendationResolutionState" AS ENUM ('UNRESOLVED', 'AUTO_RESOLVED_AFTER_RESCAN', 'MANUALLY_RESOLVED', 'SUPERSEDED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "RecommendationBatchStatus" AS ENUM ('ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ClusterMembershipRole" AS ENUM ('PILLAR', 'SUPPORTING', 'MISSING', 'WEAK');

-- CreateEnum
CREATE TYPE "ClusterMembershipSource" AS ENUM ('MANUAL', 'INFERRED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('BUSINESS', 'EXPERT', 'REVIEWER', 'INSTITUTION', 'PRODUCT', 'SERVICE', 'LOCATION', 'CERTIFICATION', 'PUBLICATION', 'CREDENTIAL', 'AFFILIATION');

-- CreateEnum
CREATE TYPE "EntitySignalType" AS ENUM ('AUTHOR', 'REVIEWER', 'INSTITUTION', 'CREDENTIAL', 'SERVICE', 'PRODUCT', 'LOCATION', 'PUBLICATION');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED');

-- CreateEnum
CREATE TYPE "MissingPageStatus" AS ENUM ('OPEN', 'DRAFT_CREATED', 'TASK_CREATED', 'PUBLISHED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ApplyOperationType" AS ENUM ('EXPORT_COPY', 'CMS_PUBLISH_ATTEMPT', 'CMS_PUBLISH_SUCCESS', 'ROUTE_VERIFY', 'MANUAL_PUBLISH_MARK');

-- CreateEnum
CREATE TYPE "ApplyOperationStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "workspaces" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_users" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "baseUrl" TEXT,
    "sourceType" "SiteSourceType" NOT NULL DEFAULT 'MANUAL',
    "crawlStatus" "SiteCrawlStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pages" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "path" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT,
    "pageType" TEXT,
    "lifecycleStatus" "PageLifecycleStatus" NOT NULL,
    "sourceStatus" "PageSourceStatus" NOT NULL,
    "existsLive" BOOLEAN NOT NULL DEFAULT false,
    "isIndexable" BOOLEAN,
    "routeLastVerifiedAt" TIMESTAMP(3),
    "currentLivePageVersionId" TEXT,
    "latestScanRunId" TEXT,
    "latestSuccessfulScanRunId" TEXT,
    "latestScoreSnapshotId" TEXT,
    "latestSuccessfulScoreSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_versions" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "parentPageVersionId" TEXT,
    "contentState" "PageVersionState" NOT NULL,
    "contentSource" "PageVersionSource" NOT NULL,
    "contentHash" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "htmlBlobKey" TEXT,
    "markdownBlobKey" TEXT,
    "extractedJson" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_runs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageVersionId" TEXT,
    "triggerType" "ScanTriggerType" NOT NULL,
    "status" "ScanRunStatus" NOT NULL,
    "failureCode" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_findings" (
    "id" TEXT NOT NULL,
    "scanRunId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageVersionId" TEXT,
    "findingType" "FindingType" NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "evidenceJson" JSONB,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scan_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "score_snapshots" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageVersionId" TEXT,
    "scanRunId" TEXT,
    "overallScore" DECIMAL(5,2),
    "answerClarityScore" DECIMAL(5,2),
    "topicalSpecificityScore" DECIMAL(5,2),
    "authorityTrustScore" DECIMAL(5,2),
    "expertVisibilityScore" DECIMAL(5,2),
    "extractabilityScore" DECIMAL(5,2),
    "internalLinkingScore" DECIMAL(5,2),
    "snippetUniquenessScore" DECIMAL(5,2),
    "conversionClarityScore" DECIMAL(5,2),
    "entityConsistencyScore" DECIMAL(5,2),
    "updateReadinessScore" DECIMAL(5,2),
    "confidence" DECIMAL(5,2),
    "severity" INTEGER,
    "blockersCount" INTEGER NOT NULL DEFAULT 0,
    "reasonCodesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "score_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendation_batches" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "scanRunId" TEXT,
    "pageVersionId" TEXT,
    "status" "RecommendationBatchStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recommendation_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "recommendationBatchId" TEXT,
    "generatedFromScanRunId" TEXT,
    "generatedFromPageVersionId" TEXT,
    "type" "RecommendationType" NOT NULL,
    "priority" "TaskPriority" NOT NULL,
    "severity" INTEGER,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "whyItMatters" TEXT,
    "evidenceJson" JSONB,
    "status" "RecommendationStatus" NOT NULL,
    "resolutionState" "RecommendationResolutionState" NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "resolvedByPageVersionId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "previousRecommendationId" TEXT,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_links" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "draftPageVersionId" TEXT NOT NULL,
    "recommendationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "draft_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "topic" TEXT,
    "ownerUserId" TEXT,
    "healthScore" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cluster_memberships" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "role" "ClusterMembershipRole" NOT NULL,
    "source" "ClusterMembershipSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cluster_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "missing_page_opportunities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clusterId" TEXT,
    "pageId" TEXT,
    "proposedTitle" TEXT,
    "proposedSlug" TEXT,
    "pageType" TEXT,
    "rationale" TEXT,
    "status" "MissingPageStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missing_page_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityType" "EntityType" NOT NULL,
    "name" TEXT NOT NULL,
    "canonicalName" TEXT,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_entity_signals" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageVersionId" TEXT,
    "entityId" TEXT NOT NULL,
    "signalType" "EntitySignalType" NOT NULL,
    "visibilityScore" DECIMAL(5,2),
    "evidenceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_entity_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "linkedPageId" TEXT,
    "linkedClusterId" TEXT,
    "linkedRecommendationId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL,
    "status" "TaskStatus" NOT NULL,
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apply_operations" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "pageVersionId" TEXT,
    "operationType" "ApplyOperationType" NOT NULL,
    "status" "ApplyOperationStatus" NOT NULL,
    "outputJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apply_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_logs" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "pageId" TEXT,
    "actorUserId" TEXT,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspaces_slug_key" ON "workspaces"("slug");

-- CreateIndex
CREATE INDEX "workspace_users_workspaceId_role_idx" ON "workspace_users"("workspaceId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "workspace_users_workspaceId_email_key" ON "workspace_users"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "sites_domain_key" ON "sites"("domain");

-- CreateIndex
CREATE INDEX "sites_workspaceId_idx" ON "sites"("workspaceId");

-- CreateIndex
CREATE INDEX "sites_workspaceId_crawlStatus_idx" ON "sites"("workspaceId", "crawlStatus");

-- CreateIndex
CREATE INDEX "pages_workspaceId_lifecycleStatus_idx" ON "pages"("workspaceId", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "pages_siteId_lifecycleStatus_idx" ON "pages"("siteId", "lifecycleStatus");

-- CreateIndex
CREATE INDEX "pages_currentLivePageVersionId_idx" ON "pages"("currentLivePageVersionId");

-- CreateIndex
CREATE INDEX "pages_latestScanRunId_idx" ON "pages"("latestScanRunId");

-- CreateIndex
CREATE INDEX "pages_latestSuccessfulScanRunId_idx" ON "pages"("latestSuccessfulScanRunId");

-- CreateIndex
CREATE INDEX "pages_latestScoreSnapshotId_idx" ON "pages"("latestScoreSnapshotId");

-- CreateIndex
CREATE INDEX "pages_latestSuccessfulScoreSnapshotId_idx" ON "pages"("latestSuccessfulScoreSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "pages_siteId_path_key" ON "pages"("siteId", "path");

-- CreateIndex
CREATE UNIQUE INDEX "pages_siteId_slug_key" ON "pages"("siteId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "pages_siteId_url_key" ON "pages"("siteId", "url");

-- CreateIndex
CREATE INDEX "page_versions_pageId_contentState_idx" ON "page_versions"("pageId", "contentState");

-- CreateIndex
CREATE INDEX "page_versions_parentPageVersionId_idx" ON "page_versions"("parentPageVersionId");

-- CreateIndex
CREATE INDEX "page_versions_contentHash_idx" ON "page_versions"("contentHash");

-- CreateIndex
CREATE INDEX "scan_runs_workspaceId_status_idx" ON "scan_runs"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "scan_runs_pageId_status_idx" ON "scan_runs"("pageId", "status");

-- CreateIndex
CREATE INDEX "scan_runs_pageVersionId_idx" ON "scan_runs"("pageVersionId");

-- CreateIndex
CREATE INDEX "scan_findings_scanRunId_findingType_idx" ON "scan_findings"("scanRunId", "findingType");

-- CreateIndex
CREATE INDEX "scan_findings_pageId_idx" ON "scan_findings"("pageId");

-- CreateIndex
CREATE INDEX "scan_findings_pageVersionId_idx" ON "scan_findings"("pageVersionId");

-- CreateIndex
CREATE INDEX "score_snapshots_workspaceId_createdAt_idx" ON "score_snapshots"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "score_snapshots_pageId_createdAt_idx" ON "score_snapshots"("pageId", "createdAt");

-- CreateIndex
CREATE INDEX "score_snapshots_pageVersionId_idx" ON "score_snapshots"("pageVersionId");

-- CreateIndex
CREATE INDEX "score_snapshots_scanRunId_idx" ON "score_snapshots"("scanRunId");

-- CreateIndex
CREATE INDEX "recommendation_batches_workspaceId_status_idx" ON "recommendation_batches"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "recommendation_batches_pageId_idx" ON "recommendation_batches"("pageId");

-- CreateIndex
CREATE INDEX "recommendation_batches_scanRunId_idx" ON "recommendation_batches"("scanRunId");

-- CreateIndex
CREATE INDEX "recommendation_batches_pageVersionId_idx" ON "recommendation_batches"("pageVersionId");

-- CreateIndex
CREATE INDEX "recommendations_workspaceId_status_idx" ON "recommendations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "recommendations_pageId_idx" ON "recommendations"("pageId");

-- CreateIndex
CREATE INDEX "recommendations_recommendationBatchId_idx" ON "recommendations"("recommendationBatchId");

-- CreateIndex
CREATE INDEX "recommendations_generatedFromScanRunId_idx" ON "recommendations"("generatedFromScanRunId");

-- CreateIndex
CREATE INDEX "recommendations_generatedFromPageVersionId_idx" ON "recommendations"("generatedFromPageVersionId");

-- CreateIndex
CREATE INDEX "recommendations_resolvedByPageVersionId_idx" ON "recommendations"("resolvedByPageVersionId");

-- CreateIndex
CREATE INDEX "recommendations_previousRecommendationId_idx" ON "recommendations"("previousRecommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "recommendations_workspaceId_fingerprint_key" ON "recommendations"("workspaceId", "fingerprint");

-- CreateIndex
CREATE INDEX "draft_links_draftPageVersionId_idx" ON "draft_links"("draftPageVersionId");

-- CreateIndex
CREATE INDEX "draft_links_recommendationId_idx" ON "draft_links"("recommendationId");

-- CreateIndex
CREATE UNIQUE INDEX "draft_links_pageId_draftPageVersionId_recommendationId_key" ON "draft_links"("pageId", "draftPageVersionId", "recommendationId");

-- CreateIndex
CREATE INDEX "clusters_workspaceId_name_idx" ON "clusters"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "clusters_ownerUserId_idx" ON "clusters"("ownerUserId");

-- CreateIndex
CREATE INDEX "cluster_memberships_pageId_idx" ON "cluster_memberships"("pageId");

-- CreateIndex
CREATE UNIQUE INDEX "cluster_memberships_clusterId_pageId_key" ON "cluster_memberships"("clusterId", "pageId");

-- CreateIndex
CREATE INDEX "missing_page_opportunities_workspaceId_status_idx" ON "missing_page_opportunities"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "missing_page_opportunities_clusterId_idx" ON "missing_page_opportunities"("clusterId");

-- CreateIndex
CREATE INDEX "missing_page_opportunities_pageId_idx" ON "missing_page_opportunities"("pageId");

-- CreateIndex
CREATE INDEX "entities_workspaceId_entityType_idx" ON "entities"("workspaceId", "entityType");

-- CreateIndex
CREATE INDEX "entities_workspaceId_name_idx" ON "entities"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "page_entity_signals_pageId_signalType_idx" ON "page_entity_signals"("pageId", "signalType");

-- CreateIndex
CREATE INDEX "page_entity_signals_pageVersionId_idx" ON "page_entity_signals"("pageVersionId");

-- CreateIndex
CREATE INDEX "page_entity_signals_entityId_idx" ON "page_entity_signals"("entityId");

-- CreateIndex
CREATE INDEX "tasks_workspaceId_status_idx" ON "tasks"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "tasks_linkedPageId_idx" ON "tasks"("linkedPageId");

-- CreateIndex
CREATE INDEX "tasks_linkedClusterId_idx" ON "tasks"("linkedClusterId");

-- CreateIndex
CREATE INDEX "tasks_linkedRecommendationId_idx" ON "tasks"("linkedRecommendationId");

-- CreateIndex
CREATE INDEX "tasks_ownerUserId_idx" ON "tasks"("ownerUserId");

-- CreateIndex
CREATE INDEX "apply_operations_workspaceId_status_idx" ON "apply_operations"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "apply_operations_pageId_idx" ON "apply_operations"("pageId");

-- CreateIndex
CREATE INDEX "apply_operations_pageVersionId_idx" ON "apply_operations"("pageVersionId");

-- CreateIndex
CREATE INDEX "change_logs_workspaceId_createdAt_idx" ON "change_logs"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "change_logs_pageId_idx" ON "change_logs"("pageId");

-- CreateIndex
CREATE INDEX "change_logs_actorUserId_idx" ON "change_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "change_logs_objectType_objectId_idx" ON "change_logs"("objectType", "objectId");

-- AddForeignKey
ALTER TABLE "workspace_users" ADD CONSTRAINT "workspace_users_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_currentLivePageVersionId_fkey" FOREIGN KEY ("currentLivePageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_latestScanRunId_fkey" FOREIGN KEY ("latestScanRunId") REFERENCES "scan_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_latestSuccessfulScanRunId_fkey" FOREIGN KEY ("latestSuccessfulScanRunId") REFERENCES "scan_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_latestScoreSnapshotId_fkey" FOREIGN KEY ("latestScoreSnapshotId") REFERENCES "score_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pages" ADD CONSTRAINT "pages_latestSuccessfulScoreSnapshotId_fkey" FOREIGN KEY ("latestSuccessfulScoreSnapshotId") REFERENCES "score_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_versions" ADD CONSTRAINT "page_versions_parentPageVersionId_fkey" FOREIGN KEY ("parentPageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_runs" ADD CONSTRAINT "scan_runs_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "scan_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scan_findings" ADD CONSTRAINT "scan_findings_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "scan_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_batches" ADD CONSTRAINT "recommendation_batches_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_batches" ADD CONSTRAINT "recommendation_batches_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_batches" ADD CONSTRAINT "recommendation_batches_scanRunId_fkey" FOREIGN KEY ("scanRunId") REFERENCES "scan_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendation_batches" ADD CONSTRAINT "recommendation_batches_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_recommendationBatchId_fkey" FOREIGN KEY ("recommendationBatchId") REFERENCES "recommendation_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_generatedFromScanRunId_fkey" FOREIGN KEY ("generatedFromScanRunId") REFERENCES "scan_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_generatedFromPageVersionId_fkey" FOREIGN KEY ("generatedFromPageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_resolvedByPageVersionId_fkey" FOREIGN KEY ("resolvedByPageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_previousRecommendationId_fkey" FOREIGN KEY ("previousRecommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_links" ADD CONSTRAINT "draft_links_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_links" ADD CONSTRAINT "draft_links_draftPageVersionId_fkey" FOREIGN KEY ("draftPageVersionId") REFERENCES "page_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "draft_links" ADD CONSTRAINT "draft_links_recommendationId_fkey" FOREIGN KEY ("recommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clusters" ADD CONSTRAINT "clusters_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_memberships" ADD CONSTRAINT "cluster_memberships_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cluster_memberships" ADD CONSTRAINT "cluster_memberships_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missing_page_opportunities" ADD CONSTRAINT "missing_page_opportunities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missing_page_opportunities" ADD CONSTRAINT "missing_page_opportunities_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "missing_page_opportunities" ADD CONSTRAINT "missing_page_opportunities_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entities" ADD CONSTRAINT "entities_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_entity_signals" ADD CONSTRAINT "page_entity_signals_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_entity_signals" ADD CONSTRAINT "page_entity_signals_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_entity_signals" ADD CONSTRAINT "page_entity_signals_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linkedPageId_fkey" FOREIGN KEY ("linkedPageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linkedClusterId_fkey" FOREIGN KEY ("linkedClusterId") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_linkedRecommendationId_fkey" FOREIGN KEY ("linkedRecommendationId") REFERENCES "recommendations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_operations" ADD CONSTRAINT "apply_operations_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_operations" ADD CONSTRAINT "apply_operations_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apply_operations" ADD CONSTRAINT "apply_operations_pageVersionId_fkey" FOREIGN KEY ("pageVersionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "pages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_logs" ADD CONSTRAINT "change_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "workspace_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
