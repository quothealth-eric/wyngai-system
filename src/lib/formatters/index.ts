// Main formatter exports
export { TableOutputFormatter } from './table_formatter';
import { TableOutputFormatter } from './table_formatter';

// Type exports
export type {
  FormattedTable,
  FormattedDetectionSummary,
  FormattedDetection,
  TableColumn,
  TableRow,
  TableCell,
  TableSummary,
  OutputFormatter
} from './types';

// Utility function to create a formatter
export function createTableFormatter(): TableOutputFormatter {
  return new TableOutputFormatter();
}