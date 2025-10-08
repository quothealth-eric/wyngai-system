import { FileUploadConstraints, UploadProgress } from '@/types/analyzer';

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  processedFile?: ProcessedFile;
}

export interface ProcessedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  buffer: Buffer;
  metadata: {
    pages?: number;
    dimensions?: { width: number; height: number };
    createdAt: Date;
    classification?: 'bill' | 'eob' | 'letter' | 'portal' | 'unknown';
  };
}

export interface UploadSession {
  sessionId: string;
  files: ProcessedFile[];
  totalSize: number;
  constraints: FileUploadConstraints;
  progress: Map<string, UploadProgress>;
  errors: string[];
}

export class EnhancedFileUpload {
  private static readonly DEFAULT_CONSTRAINTS: FileUploadConstraints = {
    maxFileSize: 20 * 1024 * 1024, // 20MB
    maxTotalSize: 100 * 1024 * 1024, // 100MB
    maxFiles: 10,
    allowedTypes: [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/tiff',
      'image/heic',
      'image/heif'
    ]
  };

  private sessions: Map<string, UploadSession> = new Map();

  public createUploadSession(constraints?: Partial<FileUploadConstraints>): string {
    const sessionId = this.generateSessionId();
    const session: UploadSession = {
      sessionId,
      files: [],
      totalSize: 0,
      constraints: { ...EnhancedFileUpload.DEFAULT_CONSTRAINTS, ...constraints },
      progress: new Map(),
      errors: []
    };

    this.sessions.set(sessionId, session);
    console.log(`📁 Created upload session: ${sessionId}`);
    return sessionId;
  }

  public async validateAndProcessFile(
    sessionId: string,
    file: File | { buffer: Buffer; filename: string; mimeType: string }
  ): Promise<FileValidationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        isValid: false,
        errors: ['Invalid upload session'],
        warnings: []
      };
    }

    console.log(`🔍 Validating file: ${this.getFileName(file)}`);

    // Extract file properties
    const filename = this.getFileName(file);
    const mimeType = this.getMimeType(file);
    const buffer = await this.getBuffer(file);
    const sizeBytes = buffer.length;

    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate file count
    if (session.files.length >= session.constraints.maxFiles) {
      errors.push(`Maximum ${session.constraints.maxFiles} files allowed`);
    }

    // Validate file size
    if (sizeBytes > session.constraints.maxFileSize) {
      errors.push(`File size ${this.formatFileSize(sizeBytes)} exceeds maximum ${this.formatFileSize(session.constraints.maxFileSize)}`);
    }

    // Validate total size
    if (session.totalSize + sizeBytes > session.constraints.maxTotalSize) {
      errors.push(`Total size would exceed ${this.formatFileSize(session.constraints.maxTotalSize)} limit`);
    }

    // Validate file type
    const isAllowedType = this.validateFileType(mimeType, buffer, filename);
    if (!isAllowedType.isValid) {
      errors.push(`File type not supported: ${mimeType || 'unknown'}`);
      if (isAllowedType.suggestion) {
        warnings.push(isAllowedType.suggestion);
      }
    }

    // Validate file content
    const contentValidation = await this.validateFileContent(buffer, mimeType, filename);
    errors.push(...contentValidation.errors);
    warnings.push(...contentValidation.warnings);

    if (errors.length > 0) {
      return { isValid: false, errors, warnings };
    }

    // Process the file
    try {
      const processedFile = await this.processFile(buffer, filename, mimeType);
      return {
        isValid: true,
        errors: [],
        warnings,
        processedFile
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Failed to process file: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings
      };
    }
  }

  public addFileToSession(sessionId: string, processedFile: ProcessedFile): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.files.push(processedFile);
    session.totalSize += processedFile.sizeBytes;

    // Update progress
    const progress: UploadProgress = {
      fileId: processedFile.id,
      filename: processedFile.filename,
      progress: 100,
      status: 'complete'
    };
    session.progress.set(processedFile.id, progress);

    console.log(`✅ Added file to session ${sessionId}: ${processedFile.filename}`);
    return true;
  }

  public getSessionFiles(sessionId: string): ProcessedFile[] {
    const session = this.sessions.get(sessionId);
    return session ? [...session.files] : [];
  }

  public getSessionProgress(sessionId: string): UploadProgress[] {
    const session = this.sessions.get(sessionId);
    return session ? Array.from(session.progress.values()) : [];
  }

  public removeFileFromSession(sessionId: string, fileId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const fileIndex = session.files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) return false;

    const removedFile = session.files.splice(fileIndex, 1)[0];
    session.totalSize -= removedFile.sizeBytes;
    session.progress.delete(fileId);

    console.log(`🗑️ Removed file from session ${sessionId}: ${removedFile.filename}`);
    return true;
  }

  public clearSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Clear file buffers to free memory
      session.files.forEach(file => {
        // In a real implementation, you might want to securely wipe the buffer
      });
      this.sessions.delete(sessionId);
      console.log(`🧹 Cleared upload session: ${sessionId}`);
    }
  }

  public getSessionSummary(sessionId: string): {
    fileCount: number;
    totalSize: number;
    formattedSize: string;
    fileTypes: string[];
    hasErrors: boolean;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const fileTypes = Array.from(new Set(session.files.map(f => f.mimeType)));

    return {
      fileCount: session.files.length,
      totalSize: session.totalSize,
      formattedSize: this.formatFileSize(session.totalSize),
      fileTypes,
      hasErrors: session.errors.length > 0
    };
  }

  // Private helper methods
  private validateFileType(
    mimeType: string,
    buffer: Buffer,
    filename: string
  ): { isValid: boolean; suggestion?: string } {
    const constraints = EnhancedFileUpload.DEFAULT_CONSTRAINTS;

    // Check explicit MIME type first
    if (constraints.allowedTypes.includes(mimeType)) {
      return { isValid: true };
    }

    // Check file signature for common formats
    const signature = buffer.slice(0, 8);
    const signatureHex = signature.toString('hex').toLowerCase();

    // PDF: %PDF
    if (signatureHex.startsWith('25504446')) {
      return mimeType === 'application/pdf'
        ? { isValid: true }
        : { isValid: false, suggestion: 'File appears to be PDF but has wrong MIME type' };
    }

    // JPEG: FF D8 FF
    if (signatureHex.startsWith('ffd8ff')) {
      const isValidJpeg = ['image/jpeg', 'image/jpg'].includes(mimeType);
      return isValidJpeg
        ? { isValid: true }
        : { isValid: false, suggestion: 'File appears to be JPEG but has wrong MIME type' };
    }

    // PNG: 89 50 4E 47
    if (signatureHex.startsWith('89504e47')) {
      return mimeType === 'image/png'
        ? { isValid: true }
        : { isValid: false, suggestion: 'File appears to be PNG but has wrong MIME type' };
    }

    // TIFF: 49 49 2A 00 or 4D 4D 00 2A
    if (signatureHex.startsWith('49492a00') || signatureHex.startsWith('4d4d002a')) {
      return mimeType === 'image/tiff'
        ? { isValid: true }
        : { isValid: false, suggestion: 'File appears to be TIFF but has wrong MIME type' };
    }

    // HEIC/HEIF detection (more complex, simplified here)
    if (filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif')) {
      // Would implement proper HEIC detection in production
      return ['image/heic', 'image/heif'].includes(mimeType)
        ? { isValid: true }
        : { isValid: false, suggestion: 'File appears to be HEIC/HEIF format' };
    }

    return {
      isValid: false,
      suggestion: `Supported formats: PDF, JPEG, PNG, TIFF, HEIC/HEIF. Got: ${mimeType}`
    };
  }

  private async validateFileContent(
    buffer: Buffer,
    mimeType: string,
    filename: string
  ): Promise<{ errors: string[]; warnings: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for empty files
    if (buffer.length === 0) {
      errors.push('File is empty');
      return { errors, warnings };
    }

    // Check for suspiciously small files
    if (buffer.length < 100) {
      warnings.push('File is very small and may not contain useful content');
    }

    // Check for corrupted files based on type
    if (mimeType === 'application/pdf') {
      if (!buffer.slice(0, 4).toString().startsWith('%PDF')) {
        errors.push('PDF file appears to be corrupted');
      }
    }

    // Check for potential security issues (basic checks)
    const content = buffer.toString('utf8', 0, Math.min(1024, buffer.length));
    if (content.includes('<script>') || content.includes('javascript:')) {
      errors.push('File may contain executable content');
    }

    // Scan for potential PHI in filenames (basic patterns)
    const phiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card
      /\b[A-Z]\d{8,10}\b/ // Potential member IDs
    ];

    for (const pattern of phiPatterns) {
      if (pattern.test(filename)) {
        warnings.push('Filename may contain sensitive information - consider renaming');
        break;
      }
    }

    return { errors, warnings };
  }

  private async processFile(buffer: Buffer, filename: string, mimeType: string): Promise<ProcessedFile> {
    const fileId = this.generateFileId();
    const safeFilename = this.sanitizeFilename(filename);

    // Extract metadata
    const metadata: ProcessedFile['metadata'] = {
      createdAt: new Date()
    };

    // Estimate pages for PDFs
    if (mimeType === 'application/pdf') {
      metadata.pages = this.estimatePDFPages(buffer);
    } else {
      metadata.pages = 1;
    }

    // Get image dimensions for images
    if (mimeType.startsWith('image/')) {
      metadata.dimensions = await this.getImageDimensions(buffer, mimeType);
    }

    // Classify document type
    metadata.classification = this.classifyDocument(buffer, filename, mimeType);

    return {
      id: fileId,
      filename: safeFilename,
      originalName: filename,
      mimeType,
      sizeBytes: buffer.length,
      buffer,
      metadata
    };
  }

  private estimatePDFPages(buffer: Buffer): number {
    try {
      const bufferStr = buffer.toString('latin1');
      const pageMatches = bufferStr.match(/\/Type\s*\/Page[^s]/g);
      return pageMatches ? Math.max(1, pageMatches.length) : Math.max(1, Math.floor(buffer.length / 50000));
    } catch {
      return 1;
    }
  }

  private async getImageDimensions(buffer: Buffer, mimeType: string): Promise<{ width: number; height: number } | undefined> {
    // Simplified image dimension detection
    // In production, would use a proper image processing library

    try {
      if (mimeType === 'image/png') {
        // PNG dimensions are at bytes 16-23
        if (buffer.length > 24) {
          const width = buffer.readUInt32BE(16);
          const height = buffer.readUInt32BE(20);
          return { width, height };
        }
      } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        // JPEG dimension detection would be more complex
        // Simplified placeholder
        return { width: 1200, height: 1600 }; // Typical scan dimensions
      }
    } catch (error) {
      console.warn('Failed to extract image dimensions:', error);
    }

    return undefined;
  }

  private classifyDocument(buffer: Buffer, filename: string, mimeType: string): ProcessedFile['metadata']['classification'] {
    const content = buffer.toString('utf8', 0, Math.min(2048, buffer.length)).toLowerCase();
    const filenameLower = filename.toLowerCase();

    if (content.includes('explanation of benefits') || filenameLower.includes('eob')) {
      return 'eob';
    }

    if (content.includes('statement') || content.includes('bill') || filenameLower.includes('bill')) {
      return 'bill';
    }

    if (content.includes('appeal') || content.includes('denial') || filenameLower.includes('letter')) {
      return 'letter';
    }

    if (filenameLower.includes('portal') || filenameLower.includes('screenshot')) {
      return 'portal';
    }

    return 'unknown';
  }

  private getFileName(file: File | { buffer: Buffer; filename: string; mimeType: string }): string {
    return 'name' in file ? file.name : file.filename;
  }

  private getMimeType(file: File | { buffer: Buffer; filename: string; mimeType: string }): string {
    return 'type' in file ? file.type : file.mimeType;
  }

  private async getBuffer(file: File | { buffer: Buffer; filename: string; mimeType: string }): Promise<Buffer> {
    if ('buffer' in file) {
      return file.buffer;
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.\-_]/g, '_')
      .replace(/_{2,}/g, '_')
      .substring(0, 100); // Limit length
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFileId(): string {
    return `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Cleanup method to prevent memory leaks
  public cleanup(): void {
    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
      this.clearSession(sessionId);
    }
    console.log('🧹 Cleaned up all upload sessions');
  }
}