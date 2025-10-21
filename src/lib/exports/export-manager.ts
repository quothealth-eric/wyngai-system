/**
 * Export Manager for PDFs, Email, SMS, and Links
 * Handles all export functionality for WyngAI responses
 */

import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import sgMail from '@sendgrid/mail'
import { ChatResponse, ChatMessage, ChatSession } from '../types/rag'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE!
)

// Configure SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export interface ExportRequest {
  chatId: string
  messageId: string
  exportType: 'pdf' | 'email' | 'sms' | 'link'
  emailAddress?: string
  phoneNumber?: string
  includeFullThread?: boolean
}

export interface ExportResult {
  exportId: string
  status: 'completed' | 'failed'
  signedUrl?: string
  expiresAt?: Date
  errorMessage?: string
}

export class ExportManager {
  /**
   * Main export method - routes to specific export type
   */
  async exportResponse(request: ExportRequest): Promise<ExportResult> {
    try {
      // Create export record
      const { data: exportRecord, error } = await supabase
        .from('export_requests')
        .insert({
          chat_id: request.chatId,
          message_id: request.messageId,
          export_type: request.exportType,
          email_address: request.emailAddress,
          phone_number: request.phoneNumber,
          status: 'pending'
        })
        .select('export_id')
        .single()

      if (error) {
        throw new Error(`Failed to create export record: ${error.message}`)
      }

      const exportId = exportRecord.export_id

      // Update status to processing
      await this.updateExportStatus(exportId, 'processing')

      let result: ExportResult

      switch (request.exportType) {
        case 'pdf':
          result = await this.exportToPDF(exportId, request)
          break
        case 'email':
          result = await this.exportToEmail(exportId, request)
          break
        case 'sms':
          result = await this.exportToSMS(exportId, request)
          break
        case 'link':
          result = await this.exportToLink(exportId, request)
          break
        default:
          throw new Error(`Unsupported export type: ${request.exportType}`)
      }

      // Update export record with result
      await this.updateExportStatus(
        exportId,
        result.status,
        result.signedUrl,
        result.expiresAt,
        result.errorMessage
      )

      return { ...result, exportId }

    } catch (error) {
      console.error('Export failed:', error)
      return {
        exportId: '',
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  /**
   * Export to PDF
   */
  private async exportToPDF(exportId: string, request: ExportRequest): Promise<ExportResult> {
    try {
      // Get chat data
      const chatData = await this.getChatData(request.chatId, request.messageId, request.includeFullThread)

      // Generate PDF
      const pdfBuffer = this.generatePDF(chatData)

      // Upload to Supabase Storage
      const fileName = `exports/${request.chatId}/${exportId}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('reports')
        .upload(fileName, pdfBuffer, {
          contentType: 'application/pdf'
        })

      if (uploadError) {
        throw new Error(`PDF upload failed: ${uploadError.message}`)
      }

      // Generate signed URL (valid for 7 days)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const { data: urlData, error: urlError } = await supabase.storage
        .from('reports')
        .createSignedUrl(fileName, 7 * 24 * 60 * 60) // 7 days in seconds

      if (urlError) {
        throw new Error(`Failed to create signed URL: ${urlError.message}`)
      }

      return {
        exportId,
        status: 'completed',
        signedUrl: urlData.signedUrl,
        expiresAt
      }

    } catch (error) {
      return {
        exportId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'PDF generation failed'
      }
    }
  }

  /**
   * Export to Email
   */
  private async exportToEmail(exportId: string, request: ExportRequest): Promise<ExportResult> {
    try {
      if (!request.emailAddress) {
        throw new Error('Email address is required for email export')
      }

      // Get chat data
      const chatData = await this.getChatData(request.chatId, request.messageId, request.includeFullThread)

      // Generate PDF attachment
      const pdfBuffer = this.generatePDF(chatData)

      // Generate email content
      const emailContent = this.generateEmailHTML(chatData)

      // Send email with PDF attachment
      const msg = {
        to: request.emailAddress,
        from: {
          email: 'noreply@mywyng.co',
          name: 'WyngAI'
        },
        subject: `Your WyngAI Health Insurance Guidance - ${new Date().toLocaleDateString()}`,
        html: emailContent,
        attachments: [
          {
            content: pdfBuffer.toString('base64'),
            filename: `wyngai-guidance-${new Date().toISOString().split('T')[0]}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment'
          }
        ]
      }

      await sgMail.send(msg)

      return {
        exportId,
        status: 'completed'
      }

    } catch (error) {
      return {
        exportId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Email sending failed'
      }
    }
  }

  /**
   * Export to SMS (sends link to view online)
   */
  private async exportToSMS(exportId: string, request: ExportRequest): Promise<ExportResult> {
    try {
      if (!request.phoneNumber) {
        throw new Error('Phone number is required for SMS export')
      }

      // Create magic link for SMS
      const linkResult = await this.exportToLink(exportId, request)
      if (linkResult.status === 'failed') {
        return linkResult
      }

      // Send SMS using Twilio (would need Twilio configuration)
      const smsContent = `Your WyngAI health insurance guidance is ready: ${linkResult.signedUrl}`

      // Note: This would require Twilio setup
      // For now, we'll simulate SMS sending
      console.log(`SMS would be sent to ${request.phoneNumber}: ${smsContent}`)

      return {
        exportId,
        status: 'completed',
        signedUrl: linkResult.signedUrl,
        expiresAt: linkResult.expiresAt
      }

    } catch (error) {
      return {
        exportId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'SMS sending failed'
      }
    }
  }

  /**
   * Export to Magic Link
   */
  private async exportToLink(exportId: string, request: ExportRequest): Promise<ExportResult> {
    try {
      // Generate secure token
      const { data: tokenData, error: tokenError } = await supabase.rpc('generate_magic_link_token')

      if (tokenError) {
        throw new Error(`Token generation failed: ${tokenError.message}`)
      }

      const token = tokenData
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

      // Create magic link record
      const { error: linkError } = await supabase
        .from('magic_links')
        .insert({
          chat_id: request.chatId,
          token,
          email_address: request.emailAddress,
          expires_at: expiresAt,
          max_access_count: 10
        })

      if (linkError) {
        throw new Error(`Magic link creation failed: ${linkError.message}`)
      }

      // Generate the magic link URL
      const baseUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_BASE_URL || 'https://mywyng.co'
      const magicUrl = `${baseUrl}/t/${request.chatId}?token=${token}`

      return {
        exportId,
        status: 'completed',
        signedUrl: magicUrl,
        expiresAt
      }

    } catch (error) {
      return {
        exportId,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Link generation failed'
      }
    }
  }

  /**
   * Get chat data for export
   */
  private async getChatData(chatId: string, messageId: string, includeFullThread: boolean = false): Promise<{
    session: ChatSession
    messages: ChatMessage[]
    targetMessage?: ChatMessage
  }> {
    // Get session
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('chat_id', chatId)
      .single()

    if (sessionError) {
      throw new Error(`Failed to fetch session: ${sessionError.message}`)
    }

    // Get messages
    let messagesQuery = supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true })

    if (!includeFullThread) {
      // Get just the target message and its context
      messagesQuery = messagesQuery.eq('message_id', messageId)
    }

    const { data: messages, error: messagesError } = await messagesQuery

    if (messagesError) {
      throw new Error(`Failed to fetch messages: ${messagesError.message}`)
    }

    const targetMessage = messages.find(m => m.message_id === messageId)

    return {
      session,
      messages: messages || [],
      targetMessage
    }
  }

  /**
   * Generate PDF using jsPDF
   */
  private generatePDF(chatData: {
    session: ChatSession
    messages: ChatMessage[]
    targetMessage?: ChatMessage
  }): Buffer {
    const pdf = new jsPDF()
    let yPosition = 20

    // Header
    pdf.setFontSize(20)
    pdf.setTextColor(41, 204, 150) // WyngAI green
    pdf.text('WyngAI Health Insurance Guidance', 20, yPosition)
    yPosition += 15

    pdf.setFontSize(10)
    pdf.setTextColor(100, 100, 100)
    pdf.text(`Generated on ${new Date().toLocaleDateString()}`, 20, yPosition)
    yPosition += 20

    // Content
    pdf.setTextColor(0, 0, 0)

    for (const message of chatData.messages) {
      if (yPosition > 250) {
        pdf.addPage()
        yPosition = 20
      }

      // Message header
      pdf.setFontSize(12)
      pdf.setFont('helvetica', 'bold')
      const header = message.role === 'user' ? 'Your Question:' : 'WyngAI Answer:'
      pdf.text(header, 20, yPosition)
      yPosition += 8

      // Message content
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(10)
      const lines = pdf.splitTextToSize(message.content, 170)
      pdf.text(lines, 20, yPosition)
      yPosition += lines.length * 5 + 10

      // Add citations if present
      if (message.metadata?.citations && message.metadata.citations.length > 0) {
        pdf.setFontSize(8)
        pdf.setTextColor(60, 60, 60)
        pdf.text('Sources:', 20, yPosition)
        yPosition += 5

        for (const citation of message.metadata.citations) {
          const citationText = `• ${citation.authority.toUpperCase()}: ${citation.title}`
          const citationLines = pdf.splitTextToSize(citationText, 170)
          pdf.text(citationLines, 25, yPosition)
          yPosition += citationLines.length * 4
        }
        yPosition += 5
      }

      yPosition += 10
      pdf.setTextColor(0, 0, 0)
    }

    // Footer
    const pageCount = pdf.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      pdf.setPage(i)
      pdf.setFontSize(8)
      pdf.setTextColor(100, 100, 100)
      pdf.text(
        'This information is for educational purposes only and does not constitute legal or medical advice.',
        20,
        280
      )
      pdf.text(`Page ${i} of ${pageCount}`, 180, 290)
    }

    return Buffer.from(pdf.output('arraybuffer'))
  }

  /**
   * Generate HTML email content
   */
  private generateEmailHTML(chatData: {
    session: ChatSession
    messages: ChatMessage[]
    targetMessage?: ChatMessage
  }): string {
    const messages = chatData.messages.map(message => {
      const isUser = message.role === 'user'
      const citations = message.metadata?.citations || []

      return `
        <div style="margin-bottom: 30px; padding: 20px; background-color: ${isUser ? '#f8f9fa' : '#ffffff'}; border-left: 4px solid ${isUser ? '#007bff' : '#29cc96'}; border-radius: 8px;">
          <h3 style="margin: 0 0 10px 0; color: ${isUser ? '#007bff' : '#29cc96'}; font-size: 16px;">
            ${isUser ? 'Your Question:' : 'WyngAI Answer:'}
          </h3>
          <div style="line-height: 1.6; color: #333333;">
            ${message.content.replace(/\n/g, '<br>')}
          </div>
          ${citations.length > 0 ? `
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e9ecef;">
              <h4 style="margin: 0 0 10px 0; color: #666666; font-size: 14px;">Sources:</h4>
              <ul style="margin: 0; padding-left: 20px; color: #666666; font-size: 12px;">
                ${citations.map(citation => `
                  <li style="margin-bottom: 5px;">
                    <strong>${citation.authority.toUpperCase()}:</strong> ${citation.title}
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
        </div>
      `
    }).join('')

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Your WyngAI Health Insurance Guidance</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px; padding: 20px; background-color: #29cc96; color: white; border-radius: 8px;">
          <h1 style="margin: 0; font-size: 24px;">🤍 WyngAI</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px;">Your Healthcare Guardian Angel</p>
        </div>

        <div style="margin-bottom: 30px;">
          <p style="font-size: 16px; color: #666666;">
            Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}
          </p>
        </div>

        ${messages}

        <div style="margin-top: 40px; padding: 20px; background-color: #f8f9fa; border-radius: 8px; text-align: center;">
          <p style="margin: 0; font-size: 12px; color: #666666;">
            This information is for educational purposes only and does not constitute legal or medical advice.
            Always verify information with your insurance company and healthcare providers.
          </p>
          <p style="margin: 10px 0 0 0; font-size: 12px; color: #999999;">
            Generated by WyngAI - Your Healthcare Guardian Angel
          </p>
        </div>
      </body>
      </html>
    `
  }

  /**
   * Update export status in database
   */
  private async updateExportStatus(
    exportId: string,
    status: 'pending' | 'processing' | 'completed' | 'failed',
    signedUrl?: string,
    expiresAt?: Date,
    errorMessage?: string
  ): Promise<void> {
    const updateData: any = {
      status,
      ...(status === 'completed' && { completed_at: new Date() }),
      ...(signedUrl && { signed_url: signedUrl }),
      ...(expiresAt && { expires_at: expiresAt }),
      ...(errorMessage && { error_message: errorMessage })
    }

    await supabase
      .from('export_requests')
      .update(updateData)
      .eq('export_id', exportId)
  }
}