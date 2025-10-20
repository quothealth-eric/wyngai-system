import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { SearchShell } from '../components/search/SearchShell'
import { IntentRouter } from '../lib/intent/router'

// Mock the IntentRouter
jest.mock('../lib/intent/router', () => ({
  IntentRouter: jest.fn().mockImplementation(() => ({
    classify: jest.fn()
  }))
}))

const MockedIntentRouter = IntentRouter as jest.MockedClass<typeof IntentRouter>

describe('SearchShell Integration', () => {
  let mockClassify: jest.Mock
  let mockOnIntent: jest.Mock
  let mockOnClarificationNeeded: jest.Mock

  beforeEach(() => {
    mockClassify = jest.fn()
    MockedIntentRouter.mockImplementation(() => ({
      classify: mockClassify
    }))

    mockOnIntent = jest.fn()
    mockOnClarificationNeeded = jest.fn()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it('should render search input and examples', () => {
    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    expect(screen.getByPlaceholderText(/ask about insurance/i)).toBeInTheDocument()
    expect(screen.getByText(/analyze medical bill/i)).toBeInTheDocument()
    expect(screen.getByText(/explain my coverage/i)).toBeInTheDocument()
  })

  it('should handle text input submission', async () => {
    mockClassify.mockReturnValue({
      mode: 'CHAT',
      confidence: 0.8,
      reason: 'General insurance question',
      needsClarification: false
    })

    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const input = screen.getByPlaceholderText(/ask about insurance/i)
    const submitButton = screen.getByRole('button', { name: /search/i })

    fireEvent.change(input, { target: { value: 'What is a deductible?' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith({
        text: 'What is a deductible?',
        files: []
      })
      expect(mockOnIntent).toHaveBeenCalledWith(
        { text: 'What is a deductible?', files: [] },
        expect.objectContaining({ mode: 'CHAT' })
      )
    })
  })

  it('should handle file upload', async () => {
    mockClassify.mockReturnValue({
      mode: 'ANALYZER',
      confidence: 0.95,
      reason: 'Document files detected',
      needsClarification: false
    })

    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const fileInput = screen.getByLabelText(/upload documents/i)
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument()
    })

    const submitButton = screen.getByRole('button', { name: /search/i })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith({
        text: '',
        files: [file]
      })
      expect(mockOnIntent).toHaveBeenCalledWith(
        expect.objectContaining({ files: [file] }),
        expect.objectContaining({ mode: 'ANALYZER' })
      )
    })
  })

  it('should handle clarification needed', async () => {
    mockClassify.mockReturnValue({
      mode: 'CHAT',
      confidence: 0.4,
      reason: 'Need clarification',
      needsClarification: true,
      suggestedModes: ['CHAT', 'ANALYZER'],
      clarificationPrompt: 'What would you like to do?'
    })

    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const input = screen.getByPlaceholderText(/ask about insurance/i)
    const submitButton = screen.getByRole('button', { name: /search/i })

    fireEvent.change(input, { target: { value: 'help me' } })
    fireEvent.click(submitButton)

    await waitFor(() => {
      expect(mockOnClarificationNeeded).toHaveBeenCalledWith(
        expect.objectContaining({ needsClarification: true }),
        { text: 'help me', files: [] }
      )
      expect(mockOnIntent).not.toHaveBeenCalled()
    })
  })

  it('should handle example chip clicks', async () => {
    mockClassify.mockReturnValue({
      mode: 'ANALYZER',
      confidence: 0.9,
      reason: 'Bill analysis request',
      needsClarification: false
    })

    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const exampleChip = screen.getByText(/analyze medical bill/i)
    fireEvent.click(exampleChip)

    await waitFor(() => {
      expect(mockClassify).toHaveBeenCalledWith({
        text: 'Analyze my medical bill for errors',
        files: []
      })
      expect(mockOnIntent).toHaveBeenCalled()
    })
  })

  it('should handle keyboard shortcuts', async () => {
    mockClassify.mockReturnValue({
      mode: 'CHAT',
      confidence: 0.8,
      reason: 'General insurance question',
      needsClarification: false
    })

    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const input = screen.getByPlaceholderText(/ask about insurance/i)
    fireEvent.change(input, { target: { value: 'What is a copay?' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await waitFor(() => {
      expect(mockOnIntent).toHaveBeenCalled()
    })
  })

  it('should disable submission with empty input', () => {
    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const submitButton = screen.getByRole('button', { name: /search/i })
    expect(submitButton).toBeDisabled()
  })

  it('should enable submission with text input', () => {
    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const input = screen.getByPlaceholderText(/ask about insurance/i)
    const submitButton = screen.getByRole('button', { name: /search/i })

    fireEvent.change(input, { target: { value: 'test question' } })
    expect(submitButton).not.toBeDisabled()
  })

  it('should enable submission with file upload', async () => {
    render(
      <SearchShell
        onIntent={mockOnIntent}
        onClarificationNeeded={mockOnClarificationNeeded}
      />
    )

    const fileInput = screen.getByLabelText(/upload documents/i)
    const submitButton = screen.getByRole('button', { name: /search/i })
    const file = new File(['test'], 'test.pdf', { type: 'application/pdf' })

    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(submitButton).not.toBeDisabled()
    })
  })
})