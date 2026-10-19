-- NOT VALID preserves legacy rows while enforcing checks for every new write.
do $$ begin
 if not exists(select 1 from pg_constraint where conname='results_score_bounds' and conrelid='results'::regclass) then
  alter table results add constraint results_score_bounds check(total_questions>0 and correct_count between 0 and total_questions and score_percentage between 0 and 100 and (time_taken_seconds is null or time_taken_seconds>=0)) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conname='attempt_completion_consistent' and conrelid='attempts'::regclass) then
  alter table attempts add constraint attempt_completion_consistent check((completed_at is null)=(response is null));
 end if;
 if not exists(select 1 from pg_constraint where conname='result_answer_bounds' and conrelid='result_answers'::regclass) then
  alter table result_answers add constraint result_answer_bounds check(selected_option_index>=-1) not valid;
 end if;
end $$;
create index if not exists result_answers_question_result on result_answers(question_id,result_id);
