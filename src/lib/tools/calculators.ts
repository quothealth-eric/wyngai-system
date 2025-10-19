/**
 * WyngAI Central Assistant - Insurance Calculators
 * Plan math, NSA compliance, and cost estimation tools
 */

import {
  PlanMathInputs,
  PlanMathResult,
  NSAScenario,
  NSAResult,
  InsurancePlanInputs,
  Calculation
} from '@/lib/types/rag';

export class InsuranceCalculators {
  /**
   * Calculate patient responsibility based on plan benefits
   */
  calculatePatientShare(inputs: PlanMathInputs): PlanMathResult {
    console.log('🧮 Calculating patient share:', inputs);

    const {
      allowed_amount,
      deductible_total,
      deductible_met_at_dos,
      coinsurance,
      oop_total,
      oop_met_at_dos,
      copay = 0,
      out_of_network = false
    } = inputs;

    // Start with allowed amount (or billed if no allowed)
    let remaining_amount = allowed_amount;
    let deductible_applied = 0;
    let coinsurance_applied = 0;
    let copay_applied = copay;

    // Calculate remaining deductible
    const remaining_deductible = Math.max(0, deductible_total - deductible_met_at_dos);

    // Apply deductible first
    if (remaining_deductible > 0) {
      deductible_applied = Math.min(remaining_amount, remaining_deductible);
      remaining_amount -= deductible_applied;
    }

    // Apply coinsurance to remaining amount
    if (remaining_amount > 0 && coinsurance > 0) {
      coinsurance_applied = remaining_amount * (coinsurance / 100);
      remaining_amount -= coinsurance_applied;
    }

    // Calculate total patient share before OOP max
    let patient_share = deductible_applied + coinsurance_applied + copay_applied;

    // Apply out-of-pocket maximum
    const remaining_oop = Math.max(0, oop_total - oop_met_at_dos);
    if (patient_share > remaining_oop) {
      patient_share = remaining_oop;
      // Adjust components proportionally
      const reduction_factor = remaining_oop / (deductible_applied + coinsurance_applied + copay_applied);
      deductible_applied *= reduction_factor;
      coinsurance_applied *= reduction_factor;
      copay_applied *= reduction_factor;
    }

    const plan_pays = allowed_amount - patient_share;

    // Generate explanation
    const explanation = this.generatePatientShareExplanation({
      allowed_amount,
      deductible_applied,
      coinsurance_applied,
      copay_applied,
      patient_share,
      plan_pays,
      remaining_deductible: deductible_total - deductible_met_at_dos - deductible_applied,
      remaining_oop: oop_total - oop_met_at_dos - patient_share,
      out_of_network
    });

    return {
      patient_share: Math.round(patient_share),
      plan_pays: Math.round(plan_pays),
      deductible_applied: Math.round(deductible_applied),
      coinsurance_applied: Math.round(coinsurance_applied),
      copay_applied: Math.round(copay_applied),
      remaining_deductible: Math.max(0, deductible_total - deductible_met_at_dos - deductible_applied),
      remaining_oop: Math.max(0, oop_total - oop_met_at_dos - patient_share),
      explanation
    };
  }

  /**
   * Check No Surprises Act (NSA) protection eligibility
   */
  checkNSAProtection(scenario: NSAScenario): NSAResult {
    console.log('🛡️ Checking NSA protection:', scenario);

    const {
      service_type,
      facility_type,
      provider_type,
      state,
      notice_given = false,
      consent_given = false
    } = scenario;

    let isProtected = false;
    let explanation = '';
    const next_steps: string[] = [];

    // Emergency services are always protected
    if (service_type === 'emergency') {
      isProtected = true;
      explanation = 'Emergency services are protected under the No Surprises Act. You should only be responsible for in-network cost-sharing amounts.';
      next_steps.push(
        'Pay only your in-network cost-sharing amount',
        'Do not pay any balance bills from out-of-network providers',
        'If billed above in-network amounts, file a complaint with your state'
      );
    }
    // Ancillary services at in-network facilities
    else if (service_type === 'ancillary' && facility_type === 'hospital') {
      if (!notice_given || !consent_given) {
        isProtected = true;
        explanation = 'Ancillary services (like anesthesia, radiology, or pathology) at in-network facilities are protected when proper notice and consent were not provided.';
        next_steps.push(
          'Verify you did not receive advance notice about out-of-network providers',
          'Check if you consented to out-of-network care',
          'If no proper notice/consent, you are protected under NSA'
        );
      } else {
        isProtected = false;
        explanation = 'You may not be protected if you received proper advance notice and consented to out-of-network care.';
        next_steps.push(
          'Review the notice and consent documents you received',
          'Verify the notice met federal requirements (timing, content)',
          'Consider whether consent was truly informed and voluntary'
        );
      }
    }
    // Non-emergency services
    else {
      isProtected = false;
      explanation = 'Non-emergency services at out-of-network facilities are generally not protected under the No Surprises Act.';
      next_steps.push(
        'Review your plan\'s out-of-network benefits',
        'Contact your insurance to verify coverage',
        'Consider appealing if you believe the service should be covered'
      );
    }

    // Add state-specific resources
    const state_doi_link = this.getStateDOILink(state);
    if (state_doi_link) {
      next_steps.push(`File a complaint with ${state} Department of Insurance if needed`);
    }

    return {
      protected: isProtected,
      explanation,
      next_steps,
      state_doi_link,
      forms: isProtected ? [
        {
          name: 'NSA Complaint Form',
          description: 'Form to file a No Surprises Act complaint',
          required_info: ['Service date', 'Provider details', 'Bill amount', 'Insurance information']
        }
      ] : undefined
    };
  }

  /**
   * Estimate costs based on plan and service
   */
  estimateCosts(
    planInputs: InsurancePlanInputs,
    serviceDetails: {
      cpt_codes?: string[];
      estimated_allowed?: number;
      provider_type?: 'primary_care' | 'specialist' | 'facility';
      in_network?: boolean;
    }
  ): Calculation {
    console.log('💰 Estimating costs:', { planInputs, serviceDetails });

    const {
      estimated_allowed = 1000, // Default $10.00
      provider_type = 'specialist',
      in_network = true
    } = serviceDetails;

    // Get applicable deductible and coinsurance
    const deductible = in_network
      ? planInputs.deductible?.individual || 0
      : planInputs.network?.out_of_network_deductible || planInputs.deductible?.individual || 0;

    const coinsurance_rate = in_network
      ? planInputs.network?.in_network_coinsurance || 20
      : planInputs.network?.out_of_network_coinsurance || 40;

    // Get copay if applicable
    let copay = 0;
    if (in_network && provider_type === 'primary_care') {
      copay = planInputs.copays?.primary_care || 0;
    } else if (in_network && provider_type === 'specialist') {
      copay = planInputs.copays?.specialist || 0;
    }

    // Calculate patient share
    const deductible_applied = Math.min(estimated_allowed, deductible);
    const remaining_after_deductible = estimated_allowed - deductible_applied;
    const coinsurance_applied = remaining_after_deductible * (coinsurance_rate / 100);

    const patient_share = copay > 0 ? copay : (deductible_applied + coinsurance_applied);
    const plan_pays = estimated_allowed - patient_share;

    return {
      type: 'patient_share',
      inputs: {
        estimated_allowed,
        provider_type,
        in_network,
        plan_type: planInputs.planType
      },
      result: {
        estimated_patient_cost: Math.round(patient_share),
        estimated_plan_pays: Math.round(plan_pays),
        deductible_portion: Math.round(deductible_applied),
        coinsurance_portion: Math.round(coinsurance_applied),
        copay_portion: copay
      },
      explanation: `Based on your ${planInputs.planType} plan, you would be responsible for approximately $${(patient_share / 100).toFixed(2)} for this ${in_network ? 'in-network' : 'out-of-network'} service.`,
      assumptions: [
        'Estimate based on typical allowed amounts',
        'Actual costs may vary by provider and location',
        'Does not account for current deductible/OOP progress',
        'Subject to plan-specific coverage rules'
      ]
    };
  }

  /**
   * Calculate deductible and out-of-pocket progress
   */
  calculateProgress(
    planInputs: InsurancePlanInputs,
    yearToDateSpending: {
      deductible_met?: number;
      oop_met?: number;
    }
  ): Calculation {
    const deductible_total = planInputs.deductible?.individual || 0;
    const oop_total = planInputs.oop_max?.individual || 0;
    const deductible_met = yearToDateSpending.deductible_met || 0;
    const oop_met = yearToDateSpending.oop_met || 0;

    const deductible_remaining = Math.max(0, deductible_total - deductible_met);
    const oop_remaining = Math.max(0, oop_total - oop_met);

    const deductible_progress = deductible_total > 0 ? (deductible_met / deductible_total) * 100 : 100;
    const oop_progress = oop_total > 0 ? (oop_met / oop_total) * 100 : 100;

    return {
      type: 'oop_progress',
      inputs: { deductible_total, oop_total, deductible_met, oop_met },
      result: {
        deductible_remaining,
        oop_remaining,
        deductible_progress,
        oop_progress,
        deductible_met: deductible_progress >= 100,
        oop_met: oop_progress >= 100
      },
      explanation: `You have met ${deductible_progress.toFixed(0)}% of your deductible and ${oop_progress.toFixed(0)}% of your out-of-pocket maximum this year.`,
      assumptions: [
        'Based on individual limits (not family)',
        'Includes only covered, in-network expenses',
        'Year-to-date figures from your latest EOB'
      ]
    };
  }

  /**
   * Generate detailed explanation for patient share calculation
   */
  private generatePatientShareExplanation(details: {
    allowed_amount: number;
    deductible_applied: number;
    coinsurance_applied: number;
    copay_applied: number;
    patient_share: number;
    plan_pays: number;
    remaining_deductible: number;
    remaining_oop: number;
    out_of_network: boolean;
  }): string {
    const {
      allowed_amount,
      deductible_applied,
      coinsurance_applied,
      copay_applied,
      patient_share,
      plan_pays,
      remaining_deductible,
      remaining_oop,
      out_of_network
    } = details;

    let explanation = `For this ${out_of_network ? 'out-of-network' : 'in-network'} service with an allowed amount of $${(allowed_amount / 100).toFixed(2)}:\n\n`;

    if (copay_applied > 0) {
      explanation += `• Copay: $${(copay_applied / 100).toFixed(2)}\n`;
    }

    if (deductible_applied > 0) {
      explanation += `• Deductible applied: $${(deductible_applied / 100).toFixed(2)}\n`;
    }

    if (coinsurance_applied > 0) {
      explanation += `• Coinsurance applied: $${(coinsurance_applied / 100).toFixed(2)}\n`;
    }

    explanation += `\nYour total responsibility: $${(patient_share / 100).toFixed(2)}\n`;
    explanation += `Plan pays: $${(plan_pays / 100).toFixed(2)}\n\n`;

    if (remaining_deductible > 0) {
      explanation += `Remaining deductible: $${(remaining_deductible / 100).toFixed(2)}\n`;
    }

    if (remaining_oop > 0) {
      explanation += `Remaining out-of-pocket maximum: $${(remaining_oop / 100).toFixed(2)}`;
    }

    return explanation;
  }

  /**
   * Get state Department of Insurance link
   */
  private getStateDOILink(state: string): string | undefined {
    const stateLinks: Record<string, string> = {
      'CA': 'https://www.insurance.ca.gov/01-consumers/101-help/index.cfm',
      'NY': 'https://www.dfs.ny.gov/consumers/health_insurance',
      'TX': 'https://www.tdi.texas.gov/consumers/health-insurance/index.html',
      'FL': 'https://www.floir.com/consumers/health-insurance',
      // Add more states as needed
    };

    return stateLinks[state.toUpperCase()];
  }
}

// Export singleton instance
export const insuranceCalculators = new InsuranceCalculators();