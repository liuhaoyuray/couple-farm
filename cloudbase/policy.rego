package authz.user

default allow := false

allow if {
  input.cloudbase.resource_type == "functions"
  input.subject.auth_type == "anonymous"
}
