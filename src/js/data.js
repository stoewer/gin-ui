// Copyright (c) 2016, German Neuroinformatics Node (G-Node)
//
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted under the terms of the BSD License. See
// LICENSE file in the root of the Project.

import { stateHash } from "./utils.js"

export default class API {
    constructor(conf) {
        this.config   = { auth_url: conf.auth_url,
            repo_url: conf.repo_url,
            doi_url: conf.doi_url,
            doi_file: conf.doi_file,
            doi_example: conf.doi_example,
            doid_url: conf.doid_url,
            client_dl: conf.client_dl,
            client_id: conf.client_id,
            client_secret: conf.client_secret,
            contact_email: conf.contact_email,
            static_content: conf.static_content,
            token: null }
        this.accounts = new AccountAPI(this.config)
        this.keys     = new SSHKeyAPI(this.config)
        this.repos    = new RepoAPI(this.config)
    }

    // Redirects to the gin-auth login page to request an access token and create a session.
    // A successful request will redirect back to gin-ui/oauth/login for the token validation.
    authorize() {
        const state = stateHash(this.config.client_id, navigator.userAgent)
        const url = `${this.config.auth_url}/oauth/authorize?`
        const params = [
            ["response_type", "token"],
            ["client_id", this.config.client_id],
            ["redirect_uri", `${window.location.origin}/oauth/login`],
            ["scope", "account-read account-write repo-read repo-write"],
            ["state", encodeURIComponent(state)]
        ]
        const query = params.map((p) => { return `${encodeURIComponent(p[0])}=${encodeURIComponent(p[1])}` }).join("&")
        window.location.href = url + query
        if (window.event !== undefined) {
            window.event.returnValue = false
        }
    }

    // Requests validation of an access token at gin-auth and sets
    // the account information corresponding to the token.
    login(token_str) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/oauth/validate/${token_str}`,
                type: "GET",
                dataType: "json",
                success: (token) => {
                    resolve(token)
                },
                error: (error) => {
                    reject(error.responseJSON)
                }
            })
        }).then(
            (token) => {
                this.config.token = token
                localStorage.setItem("token", JSON.stringify(token))
                return this.accounts.get(token.login)
            }
        )
    }

    logout() {
        if (this.config.token) {
            const token = encodeURIComponent(this.config.token.jti)
            const redirect = encodeURIComponent(window.location.origin)
            const url = `${this.config.auth_url}/oauth/logout/${token}?redirect_uri=${redirect}`

            this.config.token = null
            localStorage.removeItem("token")

            window.location.href = url
            window.event.returnValue = false
        }
    }

    restore() {
        return new Promise((resolve, reject) => {
            let token = localStorage.getItem("token")
            if (!token) {
                reject(Error("No token in local storage"))
                return
            }
            token = JSON.parse(token)
            const expires = new Date(token.exp)
            if (expires < Date.now()) {
                reject(Error("Token was expired"))
                return
            }
            resolve(token)
        }).then((token) => {
            this.config.token = token
            return this.accounts.get(token.login)
        })
    }

    register() {
        const state = stateHash(this.config.client_id, navigator.userAgent)
        const uri = `${this.config.auth_url}/oauth/registration_init?`
        const kv = [
            ["response_type", "client"],
            ["client_id", this.config.client_id],
            ["redirect_uri", `${window.location.origin}`],
            ["scope", "account-create"],
            ["state", encodeURIComponent(state)]
        ]
        const query = kv.map((p) => { return `${encodeURIComponent(p[0])}=${encodeURIComponent(p[1])}` }).join("&")
        window.location.href = uri + query
        window.event.returnValue = false
    }

    /**
     * getStaticFile returns the content of a file found at the url location.
     *
     * @param url {string}
     * @returns {Promise}
     */
    getStaticFile(url) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: url,
                type: "GET",
                contentType: "application/html",
                success: (text) => { return resolve(text) },
                error: (error) => { return reject(error) }
            })
        })
    }
}

class AccountAPI {
    constructor(config) {
        this.config = config
    }

    get(username) {
        return new Promise((resolve, reject) => {
            const request = {
                url: `${this.config.auth_url}/api/accounts/${username}`,
                dataType: "json",
                success: (acc) => { return resolve(acc) },
                error: (error) => { return reject(error.responseJSON) }
            }
            if (this.config.token) {
                request.headers = { Authorization: `Bearer ${this.config.token.jti}` }
            }
            $.ajax(request)
        })
    }

    search(text) {
        return new Promise((resolve, reject) => {
            const request = {
                url: `${this.config.auth_url}/api/accounts`,
                data: {q: text},
                dataType: "json",
                success: (accounts) => { return resolve(accounts) },
                error: (error) => { return reject(error.responseJSON) }
            }
            if (this.config.token) {
                request.headers = { Authorization: `Bearer ${this.config.token.jti}` }
            }
            $.ajax(request)
        })
    }

    update(account) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/accounts/${account.login}`,
                type: "PUT",
                contentType: "application/json; charset=utf-8",
                headers: { Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify(account),
                dataType: "json",
                success: (acc) => { return resolve(acc) },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }

    updatePassword(username, password_old, password_new, password_new_repeat) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/accounts/${username}/password`,
                type: "PUT",
                contentType: "application/json; charset=utf-8",
                headers: { Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify({password_old, password_new, password_new_repeat}),
                success: () => { return resolve("ok") },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }

    updateEmail(login, email, password) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/accounts/${login}/email`,
                type: "PUT",
                contentType: "application/json; charset=utf-8",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify({password, email}),
                success: () => { return resolve("ok") },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }
}

class SSHKeyAPI {
    constructor(config) {
        this.config = config
    }

    list(username) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/accounts/${username}/keys`,
                headers: { Authorization: `Bearer ${this.config.token.jti}` },
                dataType: "json",
                success: (keys) => { return resolve(keys) },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }

    create(username, key) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/accounts/${username}/keys`,
                type: "POST",
                contentType: "application/json; charset=utf-8",
                headers: { Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify(key),
                dataType: "json",
                success: (k) => { return resolve(k) },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }

    remove(key) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.auth_url}/api/keys?fingerprint=${encodeURIComponent(key.fingerprint)}`,
                type: "DELETE",
                headers: { Authorization: `Bearer ${this.config.token.jti}` },
                dataType: "json",
                success: (k) => { return resolve(k) },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }
}

class RepoAPI {
    constructor(config) {
        this.config = config
    }

    filterRepos(search_text = null, repos) {
        const search_lower = search_text ? search_text.toLowerCase() : ""
        return new Promise((resolve) => {
            const curr_data = Array.from(repos)
                .filter((repo) => {
                    const all = (repo.Name + repo.Description + repo.Owner).toLowerCase()
                    return all.search(search_lower) >= 0
                })
            resolve(curr_data)
        })
    }

    listPublic() {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.repo_url}/repos/public`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => { return reject(error.responseJSON) }
            })
        })
    }

    listShared() {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/repos/shared`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => { return reject(error) }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    listUserRepos(username) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${username}/repos`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => { return reject(error.responseJSON) }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    getRepo(repo_owner, repo_name, branch_name) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${repo_owner}/repos/${repo_name}`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => {
                    return reject({ code: error.status,
                        status: error.statusText,
                        message: error.responseText })
                }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    getRepoCollaborators(repo_owner, repo_name) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${repo_owner}/repos/${repo_name}/collaborators`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => {
                    return reject({ code: error.status,
                        status: error.statusText,
                        message: error.responseText })
                }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    getBranch(repo_owner, repo_name, branch_name) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${repo_owner}/repos/${repo_name}/branches/${branch_name}`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => {
                    return reject({ code: error.status,
                        status: error.statusText,
                        message: error.responseText })
                }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    getDirectorySection(repo_owner, repo_name, branch_name, path) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${repo_owner}/repos/${repo_name}/browse/${branch_name}/${path}`,
                type: "GET",
                dataType: "json",
                success: (json) => { return resolve(json) },
                error: (error) => {
                    return reject({ code: error.status,
                        status: error.statusText,
                        message: error.responseText })
                }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    getTextFileContent(repo_owner, repo_name, object_id) {
        return new Promise((resolve, reject) => {
            const req = {
                url: `${this.config.repo_url}/users/${repo_owner}/repos/${repo_name}/objects/${object_id}`,
                type: "GET",
                dataType: "text",
                success: (text) => { return resolve(text) },
                error: (error) => {
                    return reject({ code: error.status,
                        status: error.statusText,
                        message: error.responseText })
                }
            }

            if (this.config.token) {
                req["headers"] = { Authorization: `Bearer ${this.config.token.jti}` }
            }

            $.ajax(req)
        })
    }

    create(account_login, repo_form) {
        return new Promise((resolve, reject) => {
            const name = repo_form.name || ""
            if (!name.match(/^[a-zA-Z0-9\-_.]*$/)) {
                reject(Error("Use only alphanumeric characters without whitespaces as repository name."))
                return
            }

            if (name.length < 3 || name.length > 20) {
                reject(Error("Repository name must be between 3 and 20 characters long"))
                return
            }

            $.ajax({
                url: `${this.config.repo_url}/users/${account_login}/repos`,
                type: "POST",
                contentType: "application/json; charset=utf-8",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify(repo_form),
                dataType: "json",
                success: (repo) => { return resolve(repo) },
                error: (error) => {
                    return reject(error.statusText ? Error(error.statusText) : Error("An internal error occurred"))
                }
            })
        })
    }

    update(owner, repo_name, patch) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.repo_url}/users/${owner}/repos/${repo_name}/settings`,
                type: "PATCH",
                contentType: "application/json; charset=utf-8",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify(patch),
                dataType: "json",
                success: (p) => { return resolve(p) },
                error: (error) => {
                    return reject(error.statusText ? Error(error.statusText) : Error("An internal error occurred"))
                }
            })
        })
    }

    putCollaborator(owner, repo_name, collaborator, access_level) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.repo_url}/users/${owner}/repos/${repo_name}/collaborators/${collaborator}`,
                type: "PUT",
                contentType: "application/json; charset=utf-8",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                data: JSON.stringify(access_level),
                dataType: "json",
                success: () => { return resolve() },
                error: (error) => {
                    return reject(error.statusText ? Error(error.statusText) : Error("An internal error occurred"))
                }
            })
        })
    }

    removeCollaborator(owner, repo_name, collaborator) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.repo_url}/users/${owner}/repos/${repo_name}/collaborators/${collaborator}`,
                type: "DELETE",
                contentType: "application/json; charset=utf-8",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                success: () => { return resolve() },
                error: (error) => {
                    return reject(error.statusText ? Error(error.statusText) : Error("An internal error occurred"))
                }
            })
        })
    }

    requestDOI(owner, repo, branch) {
        const uri = `${this.config.doi_url}?`
        const kv = [
            ["repo", `${branch}:${owner}/${repo}`],
            ["user", this.config.token.login],
            ["token", `Bearer ${this.config.token.jti}`]
        ]
        const query = kv.map((p) => { return `${encodeURIComponent(p[0])}=${encodeURIComponent(p[1])}` }).join("&")

        window.location.href = uri + query
        window.event.returnValue = false
    }

    // listCommits returns json containing commit list for the branch
    // of a specified repository.
    listCommits(owner, repo, branch) {
        return new Promise((resolve, reject) => {
            $.ajax({
                url: `${this.config.repo_url}/users/${owner}/repos/${repo}/commits/${branch}`,
                type: "GET",
                dataType: "json",
                headers: {Authorization: `Bearer ${this.config.token.jti}`},
                success: (commits) => { return resolve(commits) },
                error: (err) => { return reject(err) }
            })
        })
    }
}
