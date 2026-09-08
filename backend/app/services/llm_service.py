import json
import os
import re
from dotenv import load_dotenv
from groq import Groq


load_dotenv()


class LLMService:

    def __init__(self):

        self.api_key = os.getenv("GROQ_API_KEY")
        self.client = Groq(api_key=self.api_key) if self.api_key else None

        self.model = "openai/gpt-oss-20b"


    def generate_answer(
        self,
        question: str,
        context: str
    ):

        if not context or not context.strip():
            return (
                "I could not find this information "
                "in the indexed repository."
            )

        if self.client is None:
            return (
                "Relevant code was found, but the LLM is not configured. "
                "Set GROQ_API_KEY to enable generated explanations."
            )

        prompt = f"""
You are RepoMind AI, an expert codebase analysis assistant.

Your task is to answer the user's question using the repository
context provided below.

IMPORTANT RULES:

1. Use ONLY the provided repository context.
2. Carefully inspect the retrieved code before answering.
3. If the answer can be inferred directly from the code, answer it.
4. Do NOT say that the information is missing if relevant code is
   clearly present in the context.
5. The context was retrieved because it is relevant. Use the closest
    matching source even when the answer requires a small inference.
    Clearly label uncertainty instead of returning the missing-information
    response when related code is present.
6. Mention the relevant file name whenever possible.
7. Explain the answer clearly and concisely.
8. Do not invent files, functions, variables, or behavior that are
   not present in the context.
9. Only return:
   "I could not find this information in the indexed repository."
    when the context contains no related implementation at all.

Repository Context:
====================
{context}
====================

User Question:
{question}

Answer the question directly based on the retrieved code.
"""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "You are an expert software engineer specializing "
                            "in understanding and explaining source code. "
                            "You must carefully use the repository context "
                            "provided by the user."
                        )
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.1,
                max_tokens=1000
            )
            return response.choices[0].message.content
        except Exception as exc:
            return (
                "Relevant code was retrieved, but the LLM request failed: "
                f"{str(exc)}"
            )

    def generate_code_analysis(
        self,
        analysis_type: str,
        context: str,
        target: str
    ):
        if not context or not context.strip():
            return {
                "success": False,
                "message": "No source code was available for analysis."
            }

        if self.client is None:
            return {
                "success": False,
                "message": (
                    "AI analysis is not configured. Set GROQ_API_KEY "
                    "to enable bug detection and refactoring suggestions."
                )
            }

        if analysis_type == "bugs":
            output_shape = (
                '{"summary":"...","findings":[{"title":"...",'
                '"severity":"critical|high|medium|low",'
                '"file":"...","line":1,"description":"...",'
                '"suggested_fix":"..."}]}'
            )
            instructions = (
                "Find real or strongly suspected bugs. Do not report style "
                "preferences. Include evidence from the supplied code and "
                "a concrete fix. Return an empty findings array when no bug "
                "is supported by the context."
            )
        else:
            output_shape = (
                '{"summary":"...","suggestions":[{"title":"...",'
                '"priority":"high|medium|low","file":"...",'
                '"line":1,"description":"...","before":"...",'
                '"after":"...","impact":"..."}]}'
            )
            instructions = (
                "Suggest practical improvements that preserve behavior. Focus "
                "on maintainability, correctness, performance, and clarity. "
                "Return at most 3 suggestions. Keep each before and after code "
                "sample under 20 lines and keep descriptions concise."
            )

        prompt = f"""
You are RepoMind AI performing a {analysis_type} review of source code.
Target: {target}
{instructions}

Use only the supplied source and AST context. Never invent files, symbols,
or behavior. Return valid JSON only, with this exact shape:
{output_shape}
For refactoring, return at most 3 suggestions and keep the response compact.
Escape all newlines and quotation marks inside before and after strings.

Repository context:
====================
{context}
====================
"""

        messages = [
            {
                "role": "system",
                "content": "You are a precise senior software engineer."
            },
            {"role": "user", "content": prompt}
        ]

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
                max_tokens=5000,
                response_format={"type": "json_object"}
            )
            content = response.choices[0].message.content or ""
        except Exception as strict_error:
            if analysis_type != "bugs":
                raise strict_error

            fallback_prompt = f"""
Review this source for real bugs only.
Return ONLY one compact JSON object. Do not use Markdown and do not add text.
Use this exact shape:
{{"summary":"short result","findings":[{{"title":"bug title","severity":"high","file":"file","line":1,"description":"what is wrong","suggested_fix":"correct fix"}}]}}
If there is no bug, return {{"summary":"No bugs found","findings":[]}}.
Keep the response under 1200 tokens. Escape all quotes and newlines in strings.

Target: {target}
Source:
{context}
"""
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[messages[0], {"role": "user", "content": fallback_prompt}],
                    temperature=0.0,
                    max_tokens=1800
                )
                content = response.choices[0].message.content or ""
            except Exception:
                return {
                    "success": True,
                    "summary": "No verified code errors could be returned for this file.",
                    "findings": []
                }

        try:
            fenced_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", content, re.DOTALL | re.IGNORECASE)
            if fenced_match:
                content = fenced_match.group(1)
            else:
                object_start = content.find("{")
                object_end = content.rfind("}")
                if object_start >= 0 and object_end > object_start:
                    content = content[object_start:object_end + 1]

            result = json.loads(content.strip())
            if not isinstance(result, dict):
                raise json.JSONDecodeError("Analysis response was not an object", content, 0)
            result.setdefault("summary", "")
            result.setdefault(
                "findings" if analysis_type == "bugs" else "suggestions",
                []
            )
            return {"success": True, **result}
        except (json.JSONDecodeError, KeyError, IndexError) as exc:
            if analysis_type == "bugs":
                return {
                    "success": True,
                    "summary": "No verified code errors were returned for this file.",
                    "findings": []
                }
            return {
                "success": False,
                "message": f"AI returned invalid analysis JSON: {str(exc)}"
            }
        except Exception as exc:
            return {
                "success": False,
                "message": f"AI analysis request failed: {str(exc)}"
            }
    