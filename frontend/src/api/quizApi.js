import {request} from './client';
export const listQuizzes=()=>request('/quiz');
export const getQuiz=id=>request(`/quiz/${id}/start`,{method:'POST',body:'{}'});
