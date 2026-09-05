# Security policy

## Supported versions

Security fixes are applied to the latest revision on the default branch. This
is an early portfolio project; historical versions are not supported.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability. Instead,
contact the repository owner privately through the contact method listed on
their GitHub profile, with:

- a concise description of the issue and affected path/version;
- safe reproduction steps or a proof of concept;
- expected and observed behavior; and
- any suggested mitigation.

Please avoid including credentials, private datasets, model weights, or real
customer data. Acknowledgement and an initial assessment will be made as soon
as practical. If a public disclosure is needed, coordinate timing with the
maintainer first.

## Scope notes

The report loader treats JSON validation as an integrity boundary and limits
report files to 5 MiB. This is not a substitute for normal deployment controls:
run the optional API behind appropriate network access controls, restrict write
access to its artifact directory, set explicit CORS origins, and keep all
secrets outside the repository.

