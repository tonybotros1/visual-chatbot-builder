"""The writing rules shown above the code box, and given to whoever (person or AI) writes a Bot Script.

Kept as data next to the reader so one test can prove that every example in the rules really builds.
"""

EXAMPLE = """bot: Clinic Intake
languages: en, ar

[welcome] message
en: Welcome to the clinic assistant.
I will ask a few short questions.
ar: مرحباً بك في مساعد العيادة.
سأطرح عليك بعض الأسئلة القصيرة.

[language] language
en: Please select your preferred language.
ar: يرجى اختيار اللغة المفضلة.

[name] text
save: name
en: What is your full name?
ar: ما اسمك الكامل؟

[age] number
save: age
min: 1
max: 120
en: How old are you, {{name}}?
ar: كم عمرك يا {{name}}؟

[adult] condition
if: age >= 18
else -> minor

[visit] choice
save: visit_type
en: What kind of visit do you need?
ar: ما نوع الزيارة التي تحتاجها؟
- New patient | مريض جديد
- Follow-up | متابعة
- I only have a question | لدي سؤال فقط -> contact

[symptoms] multi
save: symptoms
min: 1
max: 3
en: Which symptoms do you have? You can choose several.
ar: ما الأعراض التي لديك؟ يمكنك اختيار أكثر من واحد.
- Fever | حمى
- Cough | سعال
- Headache | صداع

[report] upload
save: report
required: no
files: 2
types: pdf, image
en: You can upload a medical report if you have one.
ar: يمكنك رفع تقرير طبي إن وجد.

[phone] phone
save: phone
en: What is your mobile number?
ar: ما رقم جوالك؟

[callback] yesno
save: wants_call
en: Would you like us to call you?
ar: هل ترغب في أن نتصل بك؟
no -> thanks

[rating] rating
save: rating
max: 5
en: How easy was this chat?
ar: ما مدى سهولة هذه المحادثة؟

[thanks] end
en: Thank you, {{name}}. Our team will contact you soon.
* Keep your phone nearby.
* Bring your ID to the visit.
ar: شكراً لك يا {{name}}. سيتواصل معك فريقنا قريباً.
* أبقِ هاتفك بالقرب منك.
* أحضر هويتك عند الزيارة.

[contact] links
en: You can reach us here:
ar: يمكنك التواصل معنا هنا:
- phone: +966500000000 | Call us | اتصل بنا
- whatsapp: +966500000000 | WhatsApp | واتساب
- email: care@example.com | E-mail | البريد الإلكتروني
- website: https://example.com | Website | الموقع الإلكتروني
-> goodbye

[minor] end
en: Sorry, this service is for adults aged 18 or older.
ar: عذراً، هذه الخدمة للبالغين من عمر 18 عاماً فأكثر.

[goodbye] end
en: Thank you for contacting us.
ar: شكراً لتواصلك معنا.
button: Visit our website | زيارة موقعنا | https://example.com
"""

RULES = """BOT SCRIPT RULES
================

You are writing a chatbot in Bot Script. Follow these rules exactly and reply with the code only,
with no explanation before or after it.

1. THE TOP OF THE FILE
   bot: <name of the bot>
   languages: en, ar        (one language: "languages: en" or "languages: ar")

2. STEPS
   The bot is a list of steps. A step starts with its name in square brackets and its type:

   [name] message

   - The name is yours to choose: letters, digits and underscores, no spaces, different for every step.
   - After a step, the bot continues with the NEXT STEP IN THE FILE, unless an arrow sends it elsewhere.
   - Leave an empty line between steps. Lines starting with # are comments and are ignored.
   - A line starting with "# NOTE:" is shown to the bot's owner when the code is checked. Use it to
     report anything the document leaves open (see rule 13).

3. TEXT
   Every step that shows something needs its text in every language, one line per language:

   en: What is your full name?
   ar: ما اسمك الكامل؟

   - Text can continue on the following lines. An empty line inside the text makes a new paragraph.
   - A line starting with "* " is a bullet point.
   - {{name}} shows an earlier answer, where "name" is what an earlier step wrote after "save:".
   - With one language you may write "text:" instead of "en:" or "ar:".
   - Copy the wording of the source document exactly, in every language. Do not shorten, rephrase,
     translate or "improve" it, and keep Arabic vowel marks (tashkeel) as they are written.

4. STEP TYPES
   message     shows text, asks nothing
   text        asks for free text
   number      asks for a number             optional: min: / max:
   email       asks for an e-mail address
   phone       asks for a phone number
   date        asks for a date
   choice      buttons, the visitor picks one
   yesno       a Yes / No question
   multi       a list, the visitor picks several     optional: min: / max: (how many may be picked)
   rating      stars                         optional: max: (default 5)
   scale       a number scale                optional: min: / max: (default 0 to 10)
   upload      asks for a file               optional: files: 3   and   types: pdf, image, word, excel
   links       shows text with link buttons
   condition   chooses a path from an earlier answer, shows nothing
   set         stores a value, shows nothing
   language    the language question (two or more languages only)
   end         the last message of a path; the chat finishes here

5. SAVING ANSWERS
   Every step that asks something should name its answer:

   save: full_name

   Use lowercase letters, digits and underscores. If "save:" is missing, the step name is used.
   A question must be answered unless you add:  required: no
   Add "required: no" ONLY when the document itself says the answer is optional (for example
   "if available" or "optional"). When in doubt, leave the question required.

6. OPTIONS (choice and multi)
   One line per option, starting with "- ". Write the label once per language, separated by "|",
   in the same order as the "languages:" line:

   - New patient | مريض جديد
   - Follow-up | متابعة -> follow_up

   - In a choice, "-> step_name" after an option sends that option to another step. An option without
     an arrow continues with the next step in the file.
   - In a multi, options never have arrows. All of them continue to the same step.
   - A "Continue" button is a choice with one option.

7. ARROWS (going somewhere other than the next step)
   -> step_name            on its own line: where this step continues
   yes -> step_name        in a yesno step
   no -> step_name         in a yesno step
   then -> step_name       in a condition, when it is true
   else -> step_name       in a condition, when it is false
   Write the step name without brackets. Any side without an arrow continues with the next step.

8. CONDITIONS
   [adult] condition
   if: age >= 18
   else -> minor

   Compare with ==  !=  >  <  >=  <=  or "contains". "if: report exists" checks that an answer was given.
   For a choice, compare with the option's FIRST-language label:  if: visit_type == Follow-up
   For a yesno, compare with Yes or No:  if: wants_call == Yes

9. LINKS
   - phone: +966500000000 | Call us | اتصل بنا
   - website: https://example.com | Website | الموقع
   Kinds: website, email, phone, whatsapp, facebook, instagram, twitter, linkedin, youtube, tiktok,
   telegram, snapchat. After the colon comes the address or number, then one label per language.

10. ENDING
   Every path must finish at an end step. An end step may have a button:
   button: Visit our website | زيارة موقعنا | https://example.com

11. TWO LANGUAGES
   - Write every step ONCE, with one text line per language. Never write the flow twice.
   - Put the welcome message first, then one "language" step. Steps before the language step are
     shown once with both languages together; steps after it are shown in the chosen language only.
   - If you leave the language step out, the bot asks for the language before anything else.

12. TURNING A DOCUMENT INTO CODE
   - A heading or paragraph the visitor only reads becomes a message.
   - A field the visitor fills in becomes text, number, email, phone or date. Every field is
     required unless the document says it is optional ("if available", "optional"). If the document
     marks required fields with *, then the fields without * are the optional ones.
   - A list of buttons becomes a choice. Each branch of the document becomes its own group of steps,
     reached with an arrow, and ends with an end step or an arrow back to the shared path.
   - A paragraph followed by one button is ONE choice step: the paragraph is its text and the button
     is its only option.
   - A lone "Continue", "Next" or "Submit" button after a group of fields is left out. In a chat,
     sending the last answer already continues.
   - "Auto-populated" values are shown with {{...}} inside the text; do not ask for them again.
   - There is no signature pad: ask the visitor to type their full name in a text step.

13. STAY FAITHFUL TO THE DOCUMENT
   The document is an approved script. The code must say what the document says and nothing else.
   - Never add a step the document does not have (no extra questions, uploads, confirmations).
   - Never write visitor-facing text that is not in the document. If a step needs text and the
     document gives none, use the document's own heading or button label for it.
   - Never fill in a blank. If the document says "insert e-mail here", points to a form, page or
     link it does not contain, or leaves a number empty, do not guess and do not copy a value from
     another section.
   - Report every such gap, and every place where you had to decide something the document does not
     say, on its own line directly above the step it concerns:

     # NOTE: The document does not include the consent form text. This step shows only its title.

COMPLETE EXAMPLE
================

""" + EXAMPLE
