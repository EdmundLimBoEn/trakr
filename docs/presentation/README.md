# Trakr presentation

A five-minute pitch followed by a three-minute demonstration, grounded in repository snapshot `6467a41`.

- **Trakr-pitch.pptx**: editable 16:9 slides with embedded presenter notes.
- **Trakr-pitch.pdf**: matching PDF for reliable projection or sharing.
- **speaker-notes.md**: timed script, sources and appendix answers.
- **demo-runbook.md**: rehearsal setup, exact demo sequence and fallback.
- **build.py**: reproducible source for both formats.

Present slides **1–9** in five minutes, leave **10** on screen during the demo, and reserve **11–18** for questions. The main script is approximately 710 words; rehearse with a timer and leave room for slide transitions. PDF does not include speaker notes. Open the PPTX in PowerPoint or import it into Google Slides; check font substitution before presenting. The PDF has embedded fonts and is the most predictable visual version.

The argument covers the problem, intended users, use case, data flow, engineering decisions, proposed validation, buyer/revenue hypothesis and pilot ask. Appendix slides add data relationships, trust boundaries, limitations, assessment criteria, alternatives, pilot metrics, illustrative economics and evidence references.

No official grading rubric was supplied. The assessment map covers problem definition, implementation, technical understanding, testing, critical evaluation and communication. Business metrics and pilot targets are explicitly hypothetical. No customer traction, market-size estimate, measured savings or new test pass is claimed. The deck is a presentation artifact; it does not alter or deploy the application.

## Rebuild

Python 3.11+ and the Linux DejaVu Sans fonts are required:

```bash
uv venv /tmp/trakr-slides-venv
uv pip install --python /tmp/trakr-slides-venv/bin/python python-pptx==1.0.2 reportlab==5.0.1
/tmp/trakr-slides-venv/bin/python docs/presentation/build.py
```

Outputs are written next to the generator. Text and diagrams remain editable in PowerPoint. Rebuilding also regenerates the Markdown speaker script, so edit the script in `build.py` rather than the output file.
