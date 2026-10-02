export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ApiFailure {
  success: false;
  error: ApiErrorBody;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export interface HealthStatus {
  api: 'ok';
  database: 'ok' | 'error';
  redis: 'ok' | 'error';
}

export interface CursorPageInfo {
  nextCursor: string | null;
  hasNextPage: boolean;
}

export interface CursorPage<T> {
  items: T[];
  pageInfo: CursorPageInfo;
}

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  status: UserStatus;
  isSystemAdmin: boolean;
}

export interface AuthTokenResponse {
  accessToken: string;
  user: AuthUser;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  organizationName: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  role: OrganizationRole;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationDetail = OrganizationSummary;

export interface OrganizationMemberView {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  role: OrganizationRole;
  createdAt: string;
}

export interface UpdateOrganizationRequest {
  name: string;
}

export interface ChangeOrganizationMemberRoleRequest {
  role: OrganizationRole;
}

export type AssetKind = 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'OTHER';
export type AssetStatus = 'PENDING_UPLOAD' | 'READY' | 'FAILED' | 'DELETED';

export interface AssetView {
  id: string;
  organizationId: string;
  kind: AssetKind;
  status: AssetStatus;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  checksumSha256: string | null;
  createdAt: string;
  updatedAt: string;
  readyAt: string | null;
  deletedAt: string | null;
  source?: 'UPLOADED' | 'GENERATED';
  generationId?: string | null;
  inputRoles?: GenerationAssetRole[];
}

export type AssetListResponse = CursorPage<AssetView>;

export interface CreateAssetUploadRequest {
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface CreateAssetUploadResponse {
  asset: AssetView;
  upload: {
    method: 'PUT';
    url: string;
    headers: Record<string, string>;
    expiresIn: number;
  };
}

export interface CompleteAssetResponse {
  asset: AssetView;
}

export interface AssetAccessUrlResponse {
  url: string;
  expiresIn: number;
}

export type GenerationType =
  | 'VIRTUAL_TRY_ON'
  | 'MODEL_GENERATION'
  | 'PHOTOSHOOT'
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDITING'
  | 'VIDEO_GENERATION';
export type SupportedGenerationType =
  | 'IMAGE_GENERATION'
  | 'VIRTUAL_TRY_ON'
  | 'IMAGE_EDITING';
export type GenerationStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCEL_REQUESTED'
  | 'CANCELLED';
export type GenerationAssetRole =
  'PERSON' | 'GARMENT' | 'REFERENCE' | 'SOURCE' | 'MASK';
export type AIJobStatus =
  'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export interface GenerationInputAssetView {
  id: string;
  role: GenerationAssetRole;
  asset: AssetView;
}

export interface GenerationOutputAssetView {
  id: string;
  position: number;
  asset: AssetView;
}

export interface AIJobView {
  id: string;
  status: AIJobStatus;
  attempt: number;
  maxAttempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  provider?: 'MOCK' | 'FASHN' | 'OPENAI' | 'GEMINI';
}

export interface GenerationView {
  id: string;
  organizationId: string;
  type: GenerationType;
  status: GenerationStatus;
  parameters: GenerationParameters;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  creditCost: number;
}

export interface GenerationDetail extends GenerationView {
  inputs: GenerationInputAssetView[];
  outputs: GenerationOutputAssetView[];
  job: AIJobView;
}

export interface ImageGenerationParameters {
  prompt: string;
  negativePrompt?: string;
  aspectRatio?: '1:1' | '4:5' | '3:4' | '16:9';
  outputCount?: number;
}

export interface VirtualTryOnParameters {
  prompt?: string;
  resolution?: '1k' | '2k' | '4k';
  generation_mode?: 'fast' | 'balanced' | 'quality';
  num_images?: number;
}

export interface ImageEditingParameters {
  instruction: string;
  strength?: number;
}

export type GenerationParameters =
  | ImageGenerationParameters
  | VirtualTryOnParameters
  | ImageEditingParameters;

export type CreateGenerationRequest =
  | {
      type: 'IMAGE_GENERATION';
      inputs: Array<{ assetId: string; role: 'REFERENCE' | 'SOURCE' }>;
      parameters: ImageGenerationParameters;
    }
  | {
      type: 'VIRTUAL_TRY_ON';
      inputs: Array<{ assetId: string; role: 'PERSON' | 'GARMENT' }>;
      parameters: VirtualTryOnParameters;
    }
  | {
      type: 'IMAGE_EDITING';
      inputs: Array<{ assetId: string; role: 'SOURCE' | 'MASK' }>;
      parameters: ImageEditingParameters;
    };

export function calculateGenerationCreditCost(request: CreateGenerationRequest): number {
  return request.type === 'VIRTUAL_TRY_ON' ? (request.parameters.num_images ?? 1) : 0;
}

export interface CreateGenerationResponse {
  generation: GenerationView;
  job: AIJobView;
}

export type GenerationListResponse = CursorPage<GenerationDetail>;
export interface CancelGenerationResponse {
  generation: GenerationView;
  job: AIJobView;
}

export type BillingSelectionId =
  | 'starter' | 'creator' | 'studio'
  | 'topup-100' | 'topup-500' | 'topup-1000' | 'topup-5000';
export type BillingCheckoutStatus = 'CREATED' | 'COMPLETED' | 'EXPIRED' | 'FAILED';
export type BillingSubscriptionStatus = 'INACTIVE' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'UNPAID';

export interface CreateBillingCheckoutSessionRequest { selectionId: BillingSelectionId; }
export interface CreateBillingCheckoutSessionResponse { url: string; sessionId: string; }
export interface BillingCheckoutSessionView {
  sessionId: string;
  selectionId: BillingSelectionId;
  status: BillingCheckoutStatus;
  amountTotal: number | null;
  currency: string | null;
  subscriptionStatus: BillingSubscriptionStatus | null;
}
export interface BillingSummaryView {
  billingConfigured: boolean;
  creditBalance: number;
  subscriptionPlan: BillingSelectionId | null;
  subscriptionStatus: BillingSubscriptionStatus | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export type CreditLedgerEntryType =
  | 'INITIAL_GRANT'
  | 'SUBSCRIPTION_GRANT'
  | 'CREDIT_PURCHASE'
  | 'GENERATION_DEBIT'
  | 'GENERATION_REFUND'
  | 'ADMIN_ADJUSTMENT'
  | 'EXPIRATION';

export interface CreditBalanceView {
  balance: number;
  currency: 'credits';
}

export interface CreditUsageSummaryView {
  balance: number;
  usedCredits: number;
  refundedCredits: number;
  grantedCredits: number;
  purchasedCredits: number;
}

export interface CreditLedgerEntryView {
  id: string;
  type: CreditLedgerEntryType;
  amount: number;
  balanceAfter: number;
  generationId: string | null;
  description: string | null;
  createdAt: string;
}

export type CreditLedgerListResponse = CursorPage<CreditLedgerEntryView>;

export interface InsufficientCreditsErrorDetails {
  requiredCredits: number;
  availableCredits: number;
}
