import { 
    demoAddContribution, 
    demoAddMember, 
    demoGetContributions, 
    demoGetMembers, 
    demoGetStats, 
    demoUpdateMember, 
    initDemoData
} from './demoData';
import type { Contribution, Member, Stats } from './types';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

if (isDemoMode) {
    initDemoData();
}

/**
 * Standardizes fetch error handling for the real backend
 */
const handleNativeResponse = async (response: Response) => {
    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'API Request failed');
    }
    return response.json();
};

export const apiGetMembers = async (): Promise<Member[]> => {
    if (isDemoMode) return demoGetMembers();
    const res = await fetch('/api/members');
    return handleNativeResponse(res);
};

export const apiAddMember = async (memberData: Omit<Member, 'id'>): Promise<{ id: number }> => {
    if (isDemoMode) return demoAddMember(memberData);
    const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData)
    });
    return handleNativeResponse(res);
};

export const apiUpdateMember = async (id: number, memberData: Partial<Member>): Promise<{ success: boolean }> => {
    if (isDemoMode) return demoUpdateMember(id, memberData);
    const res = await fetch(`/api/members/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData)
    });
    return handleNativeResponse(res);
};

export const apiGetContributions = async (): Promise<Contribution[]> => {
    if (isDemoMode) return demoGetContributions();
    const res = await fetch('/api/contributions');
    return handleNativeResponse(res);
};

export const apiAddContribution = async (contribData: Omit<Contribution, 'id'>): Promise<{ id: number }> => {
    if (isDemoMode) return demoAddContribution(contribData);
    const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contribData)
    });
    return handleNativeResponse(res);
};

export const apiGetStats = async (): Promise<Stats> => {
    if (isDemoMode) return demoGetStats();
    const res = await fetch('/api/stats');
    return handleNativeResponse(res);
};
