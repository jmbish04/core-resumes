export interface PreparedQuery {
  refinedQuery: string;
  followUpQueries: string[];
}

export interface ResponseEvaluation {
  sufficient: boolean;
  gaps: string[];
  followUpQuery?: string;
}
