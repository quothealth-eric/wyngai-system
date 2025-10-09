import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { DocumentArtifact, BenefitsContext, UnifiedChatCase } from '@/types/chat';

interface ChatUploadProps {
  onCaseSubmit: (chatCase: UnifiedChatCase, benefits?: BenefitsContext) => void;
  isProcessing?: boolean;
}

interface UploadedFile {
  file: File;
  preview: string;
  docType: DocumentArtifact['docType'];
  artifactId: string;
}

export default function ChatUpload({ onCaseSubmit, isProcessing = false }: ChatUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [narrative, setNarrative] = useState('');
  const [benefits, setBenefits] = useState<Partial<BenefitsContext>>({});
  const [showBenefits, setShowBenefits] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => {
      const artifactId = `artifact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      return {
        file,
        preview: URL.createObjectURL(file),
        docType: inferDocType(file.name),
        artifactId
      };
    });

    setUploadedFiles(prev => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg'],
      'application/pdf': ['.pdf']
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    multiple: true
  });

  const inferDocType = (filename: string): DocumentArtifact['docType'] => {
    const lower = filename.toLowerCase();
    if (lower.includes('eob') || lower.includes('explanation')) return 'EOB';
    if (lower.includes('bill') || lower.includes('statement')) return 'BILL';
    if (lower.includes('letter') || lower.includes('correspondence')) return 'LETTER';
    if (lower.includes('portal') || lower.includes('online')) return 'PORTAL';
    return 'UNKNOWN';
  };

  const updateDocType = (artifactId: string, newDocType: DocumentArtifact['docType']) => {
    setUploadedFiles(prev =>
      prev.map(file =>
        file.artifactId === artifactId ? { ...file, docType: newDocType } : file
      )
    );
  };

  const removeFile = (artifactId: string) => {
    setUploadedFiles(prev => {
      const fileToRemove = prev.find(f => f.artifactId === artifactId);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.artifactId !== artifactId);
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!narrative.trim()) {
      alert('Please describe your situation before submitting.');
      return;
    }

    // Convert uploaded files to DocumentArtifacts
    const artifacts: DocumentArtifact[] = uploadedFiles.map(uploadedFile => ({
      artifactId: uploadedFile.artifactId,
      filename: uploadedFile.file.name,
      mime: uploadedFile.file.type,
      docType: uploadedFile.docType,
      pages: 1, // Would be determined by actual processing
      ocrConf: 0.85 // Would be determined by actual OCR
    }));

    const chatCase: UnifiedChatCase = {
      caseId: `case_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      artifacts,
      narrative: {
        text: narrative.trim(),
        themeHints: [] // Could be populated from UI hints
      },
      benefits: Object.keys(benefits).length > 0 ? benefits as BenefitsContext : undefined
    };

    onCaseSubmit(chatCase, benefits as BenefitsContext);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-sm border">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Document Upload Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Documents (EOBs, Bills, Letters)
          </label>

          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            <div className="space-y-2">
              <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm text-gray-600">
                {isDragActive
                  ? 'Drop the files here...'
                  : 'Drag & drop files here, or click to select'}
              </p>
              <p className="text-xs text-gray-500">
                Supports: PNG, JPG, PDF (max 10MB each)
              </p>
            </div>
          </div>

          {/* Uploaded Files List */}
          {uploadedFiles.length > 0 && (
            <div className="mt-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Uploaded Documents:</h4>
              {uploadedFiles.map((uploadedFile) => (
                <div key={uploadedFile.artifactId} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{uploadedFile.file.name}</p>
                      <p className="text-xs text-gray-500">
                        {(uploadedFile.file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <select
                      value={uploadedFile.docType}
                      onChange={(e) => updateDocType(uploadedFile.artifactId, e.target.value as DocumentArtifact['docType'])}
                      className="text-xs px-2 py-1 border border-gray-300 rounded"
                    >
                      <option value="EOB">EOB</option>
                      <option value="BILL">Bill</option>
                      <option value="LETTER">Letter</option>
                      <option value="PORTAL">Portal</option>
                      <option value="UNKNOWN">Unknown</option>
                    </select>

                    <button
                      type="button"
                      onClick={() => removeFile(uploadedFile.artifactId)}
                      className="text-red-500 hover:text-red-700"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Narrative Section */}
        <div>
          <label htmlFor="narrative" className="block text-sm font-medium text-gray-700 mb-2">
            Describe your situation *
          </label>
          <textarea
            id="narrative"
            value={narrative}
            onChange={(e) => setNarrative(e.target.value)}
            placeholder="Describe what happened, what questions you have, or what help you need. Include details about your care, any problems you're experiencing, or billing issues you're facing..."
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          />
          <p className="mt-1 text-xs text-gray-500">
            Be specific about your situation to get the most relevant help.
          </p>
        </div>

        {/* Benefits Information Toggle */}
        <div>
          <div className="flex items-center">
            <input
              id="show-benefits"
              type="checkbox"
              checked={showBenefits}
              onChange={(e) => setShowBenefits(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="show-benefits" className="ml-2 text-sm text-gray-700">
              I have my insurance benefits information (optional but helpful)
            </label>
          </div>

          {showBenefits && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Plan Type
                  </label>
                  <select
                    value={benefits.planType || ''}
                    onChange={(e) => setBenefits(prev => ({ ...prev, planType: e.target.value as BenefitsContext['planType'] }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select plan type</option>
                    <option value="HMO">HMO</option>
                    <option value="PPO">PPO</option>
                    <option value="EPO">EPO</option>
                    <option value="POS">POS</option>
                    <option value="HDHP">HDHP</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Network Status
                  </label>
                  <select
                    value={benefits.network || ''}
                    onChange={(e) => setBenefits(prev => ({ ...prev, network: e.target.value as BenefitsContext['network'] }))}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select network status</option>
                    <option value="IN">In-Network</option>
                    <option value="OUT">Out-of-Network</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Individual Deductible ($)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={benefits.deductible?.individual ? (benefits.deductible.individual / 100).toFixed(2) : ''}
                    onChange={(e) => setBenefits(prev => ({
                      ...prev,
                      deductible: {
                        ...prev.deductible,
                        individual: e.target.value ? Math.round(parseFloat(e.target.value) * 100) : undefined
                      }
                    }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Coinsurance (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={benefits.coinsurance || ''}
                    onChange={(e) => setBenefits(prev => ({ ...prev, coinsurance: e.target.value ? parseInt(e.target.value) : undefined }))}
                    placeholder="20"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={benefits.priorAuthRequired || false}
                    onChange={(e) => setBenefits(prev => ({ ...prev, priorAuthRequired: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Prior authorization required</span>
                </label>

                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={benefits.referralRequired || false}
                    onChange={(e) => setBenefits(prev => ({ ...prev, referralRequired: e.target.checked }))}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <span className="ml-2 text-sm text-gray-700">Referral required</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isProcessing || !narrative.trim()}
            className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? 'Analyzing...' : 'Get Help'}
          </button>
        </div>
      </form>
    </div>
  );
}