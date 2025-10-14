// Main chat engine exports
export { UnifiedChatEngine } from './unified_chat';
import { UnifiedChatEngine } from './unified_chat';
export { EnhancedOCRPipeline as ChatImageProcessor } from '../enhanced-ocr-pipeline';
export { ChatContextBuilder } from './context_builder';

// Re-export types from chat types
export type {
  UnifiedChatCase,
  BenefitsContext
} from '@/types/chat';

// Re-export types from analyzer types
export type {
  ChatAnswer
} from '@/types/analyzer';

// Utility function to create a chat engine
export function createChatEngine(): UnifiedChatEngine {
  return new UnifiedChatEngine();
}