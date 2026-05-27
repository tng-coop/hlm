export interface Member {
  id: number;
  name: string;
  kananame: string;
  status: string;
  join_date: string;
  dob: string;
  address: string;
  phone: string;
  is_living?: number | boolean;
  postal?: string;
  email?: string;
  remarks?: string;
}

export interface Contribution {
  id: number;
  member_id: number;
  pay_date: string;
  amount: number;
  type: string;
  notes: string;
}

export interface Stats {
  activeMembers: number;
  totalCapital: number;
}

