import { fetchApiData } from "@/lib/api";

export type UkeOperator = { id: number; name: string; full_name: string };
export const fetchUkeRadioLineOperators = () => fetchApiData<UkeOperator[]>("uke/radiolines/operators");
