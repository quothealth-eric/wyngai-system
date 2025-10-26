import { track } from '@vercel/analytics'

// Event tracking utility for Vercel Analytics
export const trackEvent = {
  // Homepage interactions
  heroGetHelpClick: () => track('hero_get_help_click'),
  heroHowItWorksClick: () => track('hero_how_it_works_click'),
  ctaGetHelpClick: () => track('cta_get_help_click'),

  // Navigation tracking
  headerGetHelpClick: () => track('header_get_help_click'),
  headerTermsClick: () => track('header_terms_click'),
  headerPrivacyClick: () => track('header_privacy_click'),
  footerTermsClick: () => track('footer_terms_click'),
  footerPrivacyClick: () => track('footer_privacy_click'),
  footerGetHelpClick: () => track('footer_get_help_click'),

  // Chat interactions
  chatMessageSent: (messageLength: number) => track('chat_message_sent', { messageLength }),
  chatConsentAgreed: () => track('chat_consent_agreed'),
  chatResponseReceived: () => track('chat_response_received'),
  chatEarlyAccessClick: () => track('chat_early_access_click'),

  // File upload tracking
  fileUploadStarted: (fileType: string, fileSize: number) => track('file_upload_started', { fileType, fileSize }),
  fileUploadCompleted: (fileType: string, fileSize: number) => track('file_upload_completed', { fileType, fileSize }),
  fileUploadFailed: (fileType: string, fileSize: number) => track('file_upload_failed', { fileType, fileSize }),
  fileRemoved: (fileType: string) => track('file_removed', { fileType }),
  chooseFilesClick: () => track('choose_files_click'),

  // Benefits form interactions
  benefitsInsuranceSelected: (insurer: string) => track('benefits_insurance_selected', { insurer }),
  benefitsPlanTypeSelected: (planType: string) => track('benefits_plan_type_selected', { planType }),
  benefitsDeductibleEntered: () => track('benefits_deductible_entered'),
  benefitsFormCompleted: () => track('benefits_form_completed'),

  // Lead capture tracking
  leadCaptureStarted: (source: string) => track('lead_capture_started', { source }),
  leadCaptureEmailEntered: (source: string) => track('lead_capture_email_entered', { source }),
  leadCaptureNameEntered: (source: string) => track('lead_capture_name_entered', { source }),
  leadCapturePhoneEntered: (source: string) => track('lead_capture_phone_entered', { source }),
  leadCaptureInvestorChecked: (source: string) => track('lead_capture_investor_checked', { source }),
  leadCaptureSubmitted: (source: string, hasName: boolean, hasPhone: boolean, isInvestor: boolean) =>
    track('lead_capture_submitted', { source, hasName, hasPhone, isInvestor }),
  leadCaptureCompleted: (source: string) => track('lead_capture_completed', { source }),

  // Donation tracking
  donateButtonClick: (source: string) => track('donate_button_click', { source }),
  donatePageVisit: () => track('donate_page_visit'),
  supportMissionClick: () => track('support_mission_click'),
  sayThanksClick: () => track('say_thanks_click'),

  // Accordion/FAQ interactions
  faqAccordionOpened: (question: string) => track('faq_accordion_opened', { question }),

  // Mobile interactions
  mobileSidebarOpened: () => track('mobile_sidebar_opened'),
  mobileSidebarClosed: () => track('mobile_sidebar_closed'),

  // Modal interactions
  leadCaptureModalOpened: () => track('lead_capture_modal_opened'),
  leadCaptureModalClosed: () => track('lead_capture_modal_closed'),

  // Page views (for SPA navigation)
  pageView: (path: string) => track('page_view', { path }),

  // Error tracking
  uploadError: (errorType: string) => track('upload_error', { errorType }),
  chatError: (errorType: string) => track('chat_error', { errorType }),
  leadCaptureError: (errorType: string) => track('lead_capture_error', { errorType })
,

  // Search engine events
  searchQuerySubmitted: (length: number) => track('search_query_submitted', { length }),
  searchAnswerRendered: (query: string, confidence: number) =>
    track('search_answer_rendered', { query, confidence }),
  ragAuthorityMix: (mix: Record<string, number>) => track('rag_authority_mix', mix),
  qaMatchUsed: (used: boolean) => track('qa_match_used', { used }),
  classificationConfidence: (value: number) => track('classification_confidence', { value }),
  resultExport: (channel: 'pdf' | 'email' | 'sms' | 'copy') => track(`result_export_${channel}`),
  lockerSaved: (source: string) => track('locker_saved', { source }),
  lockerOpened: (source: string) => track('locker_opened', { source }),
  appealStudioLaunch: (source: string) => track('appeal_studio_launch', { source })
}

// Helper function to track button clicks with additional context
export const trackButtonClick = (buttonName: string, location: string, additionalData?: Record<string, any>) => {
  track('button_click', { buttonName, location, ...(additionalData || {}) })
}

// Helper function to track form interactions
export const trackFormInteraction = (formName: string, action: string, field?: string, value?: any) => {
  const data: Record<string, any> = { formName, action }
  if (field !== undefined) data.field = field
  if (value !== undefined) data.value = value
  track('form_interaction', data)
}

// Helper function to track user journey milestones
export const trackMilestone = (milestone: string, additionalData?: Record<string, any>) => {
  track('user_milestone', { milestone, ...(additionalData || {}) })
}