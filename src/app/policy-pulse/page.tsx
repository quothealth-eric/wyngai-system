'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  Building,
  FileText,
  ExternalLink,
  RefreshCw,
  Gavel,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle
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
  summary?: string
  non_partisan_summary?: string
  status: 'introduced' | 'committee' | 'passed_house' | 'passed_senate' | 'enacted' | 'failed'
  retrieved_at: string
}

interface PolicyPulseItem {
  id: string
  title: string
  authority: string
  jurisdiction: string
  effective_date: string
  category: string
  impact_level: 'high' | 'medium' | 'low'
  pinned: boolean
  description: string
  source_url: string
}

export default function PolicyPulsePage() {
  const [bills, setBills] = useState<CongressBill[]>([])
  const [pulseItems, setPulseItems] = useState<PolicyPulseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [chamberFilter, setChamberFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState('bills')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Fetch bills from our Congress.gov integration
      const billsResponse = await fetch('/api/pulse/bills')
      if (billsResponse.ok) {
        const billsData = await billsResponse.json()
        setBills(billsData.bills || [])
      }

      // Fetch policy pulse items
      const pulseResponse = await fetch('/api/pulse/feed')
      if (pulseResponse.ok) {
        const pulseData = await pulseResponse.json()
        setPulseItems(pulseData.items || [])
      }
    } catch (error) {
      console.error('Error fetching policy data:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'enacted': return 'bg-green-100 text-green-800'
      case 'passed_house':
      case 'passed_senate': return 'bg-blue-100 text-blue-800'
      case 'committee': return 'bg-yellow-100 text-yellow-800'
      case 'introduced': return 'bg-gray-100 text-gray-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
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

  const filteredBills = bills.filter(bill => {
    const matchesSearch = bill.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         bill.number.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || bill.status === statusFilter
    const matchesChamber = chamberFilter === 'all' || bill.chamber.toLowerCase() === chamberFilter
    return matchesSearch && matchesStatus && matchesChamber
  })

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Policy Pulse</h1>
                <p className="text-sm text-gray-600">Track Healthcare Legislation & Policy Changes</p>
              </div>
            </div>
            <Button
              onClick={fetchData}
              disabled={loading}
              size="sm"
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="bills">Congressional Bills</TabsTrigger>
            <TabsTrigger value="policies">Policy Updates</TabsTrigger>
          </TabsList>

          <TabsContent value="bills" className="space-y-6">
            {/* Search and Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Gavel className="h-5 w-5 mr-2" />
                  Healthcare Bills in Congress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-4 mb-6">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search bills by title or number..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-48">
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
                    <SelectTrigger className="w-full sm:w-48">
                      <SelectValue placeholder="Filter by chamber" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Chambers</SelectItem>
                      <SelectItem value="house">House</SelectItem>
                      <SelectItem value="senate">Senate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-sm text-gray-600 mb-4">
                  Showing {filteredBills.length} of {bills.length} healthcare-related bills
                </div>
              </CardContent>
            </Card>

            {/* Bills List */}
            <div className="space-y-4">
              {loading ? (
                <div className="text-center py-8">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600">Loading healthcare bills...</p>
                </div>
              ) : filteredBills.length === 0 ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">No bills found matching your criteria</p>
                  </CardContent>
                </Card>
              ) : (
                filteredBills.map((bill) => (
                  <Card key={bill.bill_id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge variant="outline" className="text-xs">
                              {bill.congress}th Congress
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {bill.chamber} {bill.number}
                            </Badge>
                            <Badge className={`text-xs ${getStatusColor(bill.status)}`}>
                              {getStatusIcon(bill.status)}
                              <span className="ml-1 capitalize">{bill.status.replace('_', ' ')}</span>
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-lg text-gray-900 mb-2 line-clamp-2">
                            {bill.title}
                          </h3>
                          {bill.non_partisan_summary && (
                            <p className="text-sm text-gray-600 mb-3 line-clamp-3">
                              {bill.non_partisan_summary}
                            </p>
                          )}
                          <div className="text-xs text-gray-500 space-y-1">
                            <div className="flex items-center">
                              <Calendar className="h-3 w-3 mr-1" />
                              Introduced: {new Date(bill.introduced_date).toLocaleDateString()}
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              Latest Action: {bill.latest_action} ({new Date(bill.latest_action_date).toLocaleDateString()})
                            </div>
                            {bill.committees.length > 0 && (
                              <div className="flex items-center">
                                <Building className="h-3 w-3 mr-1" />
                                Committees: {bill.committees.slice(0, 2).join(', ')}
                                {bill.committees.length > 2 && ` +${bill.committees.length - 2} more`}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="ml-4">
                          <Button size="sm" variant="outline" asChild>
                            <a href={bill.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4 mr-1" />
                              View on Congress.gov
                            </a>
                          </Button>
                        </div>
                      </div>

                      {bill.subjects.length > 0 && (
                        <div className="border-t pt-3">
                          <div className="text-xs text-gray-500 mb-2">Related Topics:</div>
                          <div className="flex flex-wrap gap-1">
                            {bill.subjects.slice(0, 6).map((subject) => (
                              <Badge key={subject} variant="outline" className="text-xs">
                                {subject}
                              </Badge>
                            ))}
                            {bill.subjects.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{bill.subjects.length - 6} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="policies" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Policy Updates & Changes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Stay informed about the latest healthcare policy changes, regulations, and updates.
                </p>

                {pulseItems.length === 0 ? (
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">No policy updates available at the moment</p>
                    <p className="text-sm text-gray-500 mt-2">Check back regularly for the latest healthcare policy changes</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {pulseItems.map((item) => (
                      <Card key={item.id} className={`${item.pinned ? 'ring-2 ring-blue-200' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2 mb-2">
                                {item.pinned && (
                                  <Badge className="bg-blue-100 text-blue-800 text-xs">Pinned</Badge>
                                )}
                                <Badge variant="outline" className="text-xs">
                                  {item.authority}
                                </Badge>
                                <Badge variant="secondary" className="text-xs">
                                  {item.category}
                                </Badge>
                              </div>
                              <h4 className="font-medium text-gray-900 mb-2">{item.title}</h4>
                              <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                              <div className="text-xs text-gray-500">
                                Effective: {new Date(item.effective_date).toLocaleDateString()}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" asChild>
                              <a href={item.source_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}