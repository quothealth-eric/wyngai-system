'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  ArrowLeft,
  Search,
  Calendar,
  Building,
  FileText,
  ExternalLink,
  RefreshCw,
  Gavel,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MessageCircle,
  Eye,
  Sparkles,
  TrendingUp,
  Users,
  Target,
  ChevronRight,
  Send
} from 'lucide-react'

interface CongressBill {
  bill_id: string
  congress: number
  chamber: string
  number: string
  title: string
  introduced_date: string
  latest_action: string
  latest_action_date: string
  committees: string[]
  subjects: string[]
  url: string
  summary: string
  non_partisan_summary: string
  implications: string[]
  key_provisions: string[]
  status: 'introduced' | 'committee' | 'passed_house' | 'passed_senate' | 'enacted' | 'failed'
  retrieved_at: string
  policy_area: string
}

interface BillAnalysis {
  question: string
  answer: string
  citations: string[]
  timestamp: string
}

export default function EnhancedPolicyPulsePage() {
  const [bills, setBills] = useState<CongressBill[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [chamberFilter, setChamberFilter] = useState<string>('all')
  const [selectedBill, setSelectedBill] = useState<CongressBill | null>(null)
  const [billText, setBillText] = useState<string>('')
  const [question, setQuestion] = useState('')
  const [analysis, setAnalysis] = useState<BillAnalysis[]>([])
  const [loadingAnalysis, setLoadingAnalysis] = useState(false)
  const [showBillDetail, setShowBillDetail] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const billsResponse = await fetch('/api/pulse/bills')
      if (billsResponse.ok) {
        const billsData = await billsResponse.json()
        setBills(billsData.bills || [])
      }
    } catch (error) {
      console.error('Error fetching policy data:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchBillText = async (billId: string) => {
    try {
      const response = await fetch(`/api/pulse/bills/${billId}`)
      if (response.ok) {
        const data = await response.json()
        setBillText(data.full_text || 'Bill text not available')
      }
    } catch (error) {
      console.error('Error fetching bill text:', error)
      setBillText('Error loading bill text')
    }
  }

  const askBillQuestion = async () => {
    if (!question.trim() || !selectedBill) return

    setLoadingAnalysis(true)
    try {
      const response = await fetch(`/api/pulse/bills/${selectedBill.bill_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          context: analysis.slice(-3).map(a => `Q: ${a.question} A: ${a.answer}`).join('\\n')
        })
      })

      if (response.ok) {
        const data = await response.json()
        setAnalysis(prev => [...prev, {
          question: question.trim(),
          answer: data.answer,
          citations: data.citations || [],
          timestamp: data.timestamp
        }])
        setQuestion('')
      }
    } catch (error) {
      console.error('Error asking question:', error)
    } finally {
      setLoadingAnalysis(false)
    }
  }

  const openBillDetail = async (bill: CongressBill) => {
    setSelectedBill(bill)
    setAnalysis([])
    setShowBillDetail(true)
    await fetchBillText(bill.bill_id)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enacted': return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'passed_house':
      case 'passed_senate': return 'bg-cyan-100 text-cyan-800 border-cyan-200'
      case 'committee': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'introduced': return 'bg-gray-100 text-gray-800 border-gray-200'
      case 'failed': return 'bg-red-100 text-red-800 border-red-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'enacted': return <CheckCircle className="h-4 w-4" />
      case 'passed_house':
      case 'passed_senate': return <Gavel className="h-4 w-4" />
      case 'committee': return <Clock className="h-4 w-4" />
      case 'introduced': return <FileText className="h-4 w-4" />
      case 'failed': return <XCircle className="h-4 w-4" />
      default: return <AlertCircle className="h-4 w-4" />
    }
  }

  const getImplicationIcon = (index: number) => {
    const icons = [TrendingUp, Users, Target, Sparkles]
    const Icon = icons[index % icons.length]
    return <Icon className="h-4 w-4 text-teal-600" />
  }

  const filteredBills = bills.filter(bill => {
    const matchesSearch = bill.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bill.number.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || bill.status === statusFilter
    const matchesChamber = chamberFilter === 'all' || bill.chamber.toLowerCase() === chamberFilter
    return matchesSearch && matchesStatus && matchesChamber
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-teal-50">
      {/* Enhanced Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <Link href="/">
                <Button variant="ghost" size="sm" className="text-gray-600 hover:text-teal-600">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-600 to-emerald-600 bg-clip-text text-transparent">
                  Policy Pulse
                </h1>
                <p className="text-gray-600 mt-1">Track Healthcare Legislation & Policy Impact</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right text-sm text-gray-500">
                <div className="font-medium">{bills.length} Bills Tracked</div>
                <div>Last Updated: {new Date().toLocaleDateString()}</div>
              </div>
              <Button
                onClick={fetchData}
                disabled={loading}
                size="sm"
                className="bg-teal-600 hover:bg-teal-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="bills" className="space-y-8">
          <TabsList className="grid w-full max-w-md grid-cols-2 bg-gray-100">
            <TabsTrigger value="bills" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Congressional Bills
            </TabsTrigger>
            <TabsTrigger value="policies" className="data-[state=active]:bg-teal-600 data-[state=active]:text-white">
              Policy Updates
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bills" className="space-y-8">
            {/* Enhanced Search and Filters */}
            <Card className="border-teal-100 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center text-teal-800">
                  <Gavel className="h-6 w-6 mr-3 text-teal-600" />
                  Healthcare Bills in Congress
                  <Badge className="ml-3 bg-teal-100 text-teal-800">
                    {filteredBills.length} bills
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="md:col-span-2">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search bills by title or number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 border-gray-300 focus:border-teal-500 focus:ring-teal-500"
                      />
                    </div>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="border-gray-300 focus:border-teal-500">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="introduced">Introduced</SelectItem>
                      <SelectItem value="committee">In Committee</SelectItem>
                      <SelectItem value="passed_house">Passed House</SelectItem>
                      <SelectItem value="passed_senate">Passed Senate</SelectItem>
                      <SelectItem value="enacted">Enacted</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={chamberFilter} onValueChange={setChamberFilter}>
                    <SelectTrigger className="border-gray-300 focus:border-teal-500">
                      <SelectValue placeholder="Filter by chamber" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Chambers</SelectItem>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="senate">Senate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Enhanced Bills List */}
            <div className="space-y-6">
              {loading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-12 w-12 animate-spin mx-auto mb-4 text-teal-400" />
                  <p className="text-gray-600 text-lg">Loading healthcare bills...</p>
                </div>
              ) : filteredBills.length === 0 ? (
                <Card className="border-gray-200">
                  <CardContent className="py-12 text-center">
                    <FileText className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600 text-lg">No bills found matching your criteria</p>
                  </CardContent>
                </Card>
              ) : (
                filteredBills.map((bill) => (
                  <Card key={bill.bill_id} className="hover:shadow-xl transition-all duration-300 border-gray-200 hover:border-teal-200">
                    <CardContent className="p-8">
                      <div className="space-y-6">
                        {/* Header */}
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-3">
                            <div className="flex items-center space-x-3">
                              <Badge variant="outline" className="text-xs font-medium">
                                {bill.congress}th Congress
                              </Badge>
                              <Badge variant="secondary" className="text-xs">
                                {bill.chamber} {bill.number}
                              </Badge>
                              <Badge className={`text-xs border ${getStatusColor(bill.status)}`}>
                                {getStatusIcon(bill.status)}
                                <span className="ml-1 capitalize">{bill.status.replace('_', ' ')}</span>
                              </Badge>
                            </div>
                            <h3 className="font-bold text-xl text-gray-900 leading-tight">
                              {bill.title}
                            </h3>
                          </div>
                        </div>

                        {/* Summary */}
                        {bill.summary && (
                          <div className="bg-gradient-to-r from-teal-50 to-emerald-50 p-5 rounded-lg border border-teal-100">
                            <p className="text-gray-700 leading-relaxed">{bill.summary}</p>
                          </div>
                        )}

                        {/* Key Implications */}
                        {bill.implications && bill.implications.length > 0 && (
                          <div className="space-y-3">
                            <h4 className="font-semibold text-gray-900 flex items-center">
                              <TrendingUp className="h-4 w-4 mr-2 text-teal-600" />
                              Key Implications
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {bill.implications.slice(0, 4).map((implication, index) => (
                                <div key={index} className="flex items-start space-x-2 p-3 bg-white rounded-lg border border-gray-100">
                                  {getImplicationIcon(index)}
                                  <span className="text-sm text-gray-700">{implication}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                          <div className="flex items-center space-x-4 text-xs text-gray-500">
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Introduced: {new Date(bill.introduced_date).toLocaleDateString()}
                            </div>
                            {bill.committees.length > 0 && (
                              <div className="flex items-center">
                                <Building className="h-3 w-3 mr-1" />
                                {bill.committees[0]}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openBillDetail(bill)}
                              className="border-teal-300 text-teal-700 hover:bg-teal-50"
                            >
                              <MessageCircle className="h-4 w-4 mr-2" />
                              Analyze & Chat
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a href={bill.url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4 mr-2" />
                                View Bill
                              </a>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="policies" className="space-y-6">
            <Card className="border-teal-100">
              <CardHeader>
                <CardTitle className="flex items-center text-teal-800">
                  <AlertCircle className="h-6 w-6 mr-3 text-teal-600" />
                  Policy Updates & Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Sparkles className="h-16 w-16 mx-auto mb-4 text-teal-400" />
                  <p className="text-gray-600 text-lg mb-2">Policy analysis feature coming soon</p>
                  <p className="text-sm text-gray-500">We're working on comprehensive policy impact analysis</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Enhanced Bill Detail Dialog */}
      <Dialog open={showBillDetail} onOpenChange={setShowBillDetail}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-teal-800 flex items-center">
              <FileText className="h-5 w-5 mr-2" />
              {selectedBill?.title}
            </DialogTitle>
          </DialogHeader>

          {selectedBill && (
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
              {/* Bill Text Panel */}
              <div className="space-y-4 overflow-hidden flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">Full Bill Text</h3>
                  <Badge className="bg-teal-100 text-teal-800">
                    {selectedBill.number}
                  </Badge>
                </div>
                <div className="flex-1 overflow-auto bg-gray-50 p-4 rounded-lg border text-sm">
                  <pre className="whitespace-pre-wrap font-mono text-gray-700">
                    {billText || 'Loading bill text...'}
                  </pre>
                </div>
              </div>

              {/* Interactive Chat Panel */}
              <div className="space-y-4 overflow-hidden flex flex-col">
                <h3 className="font-semibold text-gray-900 flex items-center">
                  <MessageCircle className="h-4 w-4 mr-2 text-teal-600" />
                  Ask Questions About This Bill
                </h3>

                {/* Chat History */}
                <div className="flex-1 overflow-auto space-y-4 bg-gray-50 p-4 rounded-lg border">
                  {analysis.length === 0 ? (
                    <div className="text-center text-gray-500 py-8">
                      <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p>Ask a question about this bill to get started</p>
                    </div>
                  ) : (
                    analysis.map((item, index) => (
                      <div key={index} className="space-y-3">
                        <div className="bg-teal-600 text-white p-3 rounded-lg max-w-[80%] ml-auto">
                          <p className="text-sm">{item.question}</p>
                        </div>
                        <div className="bg-white p-4 rounded-lg border shadow-sm">
                          <p className="text-sm text-gray-700 mb-2">{item.answer}</p>
                          {item.citations.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                              <p className="text-xs font-medium text-gray-600 mb-1">Citations:</p>
                              {item.citations.map((citation, idx) => (
                                <p key={idx} className="text-xs text-gray-500 italic">
                                  {citation}
                                </p>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Question Input */}
                <div className="flex space-x-2">
                  <Textarea
                    placeholder="Ask a question about this bill..."
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    className="flex-1 min-h-[60px] resize-none border-gray-300 focus:border-teal-500"
                    disabled={loadingAnalysis}
                  />
                  <Button
                    onClick={askBillQuestion}
                    disabled={!question.trim() || loadingAnalysis}
                    className="bg-teal-600 hover:bg-teal-700 text-white px-4"
                  >
                    {loadingAnalysis ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}