let all_users = [];
let user_selection_type = "";
let form_selector = ".user-selection-form-wrapper";

/**
 * Loads users from the server and populates the user selection box.
 *
 * @param {Array} pre_selected_users - An array of pre-selected user SIDs.
 * @return {void}
 */
function loadUsers(pre_selected_users) {

  let users_con = "#user-selection-box";

  fetchDynamicData({
    container: users_con,
    url: "/content/users"
  }, (data) => {

    all_users = data.map(o => { return { sid: o.sid, full_name: o.full_name, role: o.role, email: o.email, type: null } });

    data.forEach((item, idx) => {

      $(users_con).append(renderFormUser(item, idx));

    });

    // update selected status
    if (pre_selected_users?.length > 0) {

      pre_selected_users.forEach(item => {

        let found = all_users.find(o => o.sid === item.sid);

        if (found) {

          found.type = item.type || null;

        }

      })

      updateUserList();

    }

  })

}

function removeSelectedUser(sid) {

  customConfirm("Are you sure to remove this user?").then(confirmed => {

    if (confirmed) {

      let found = all_users.find(item => item.sid === sid);

      if (found) {

        let type = found.type;
        found.type = null;
        updateUserList(all_users, type);

      }
      
    }

  });

}

function removeAllSelectedUser() {

  all_users.forEach(item => {
    item.type = null;
  })

  updateUserList();

}

/**
 * Renders a user form item as a checkbox with user details. (in the popup)
 *
 * @param {object} item - The user object containing sid, full_name, and role.
 * @param {number} [index=0] - The index of the user item for animation delay.
 * @param {boolean} [animation=true] - Whether to include animation or not.
 * @return {string} The HTML string of the rendered user form item.
 */
function renderFormUser(item, index = 0, animation = true) {

  return `
        <div class="form-check my-2 ${animation ? 'scale-in-center' : ''}" style="animation-delay: ${index * 0.1}s">
            <label class="form-check-label d-flex clickable-h" for="${item.sid}">
                <input name="users" class="form-check-input me-2" type="checkbox" value="${item.sid}" id="${item.sid}">
                <div class="small">
                    <strong>
                        ${item.full_name}
                    </strong>
                    <div class="text-muted">
                        <span class="badge bg-primary">${item.role}</span> |
                        ${item.sid}
                    </div>
                </div>
            </label>
        </div>
    `;

}

/**
 * Renders a user selection item as a row with user details. (in the list)
 *
 * @param {object} item - The user object containing name, role, and sid.
 * @param {number} [index=0] - The index of the user item for animation delay.
 * @return {string} The HTML string of the rendered user selection item.
 */
function renderSelectedUser(item, type, index = 0) {

  return `
        <div class="py-2 px-3 border bg-hover rounded-3 d-flex justify-content-between align-items-center">
            <div class="col-4 small d-flex gap-3 align-items-center">
                <div class="fs-3"> <i class="fa fa-user"></i> </div>
                <div>
                    <strong>
                        ${item.full_name}
                    </strong>
                    <div class="text-muted">
                        <span class="badge bg-primary">${item.role}</span> |
                        ${item.sid}
                    </div>
                </div>
            </div>
            <div class="col-4 text-center">
                <span class="badge bg-secondary">
                  <i class="fa-solid fa-times me-1"></i>
                  Non-Forwardable
                </span>
            </div>
            <div class="col-2 text-center">
                <span class="p-2 clickable text-danger user_remove_btn" 
                onclick="removeSelectedUser('${item.sid}')" >
                    <i class="fa fa-trash"></i>
                </span>
            </div>
            <div class="d-none">
                <input type="hidden" name="users" value="${type}-${item.sid}-nonforward">
            </div>
        </div>
    `;
}

function updateUserList(users = all_users) {

  let user_containers = $(".user-container");
  user_containers.html("");

  // update all usres in all containers
  users.forEach((item, idx) => {

    let user_container = $(`#${item.type}-users`);
    user_container.append(renderSelectedUser(item, item.type));

  });

  updateUserFormList(all_users);

}

function updateUserFormList(users = all_users) {

  let user_form = $("#user-selection-box");

  user_form.html("");

  users.forEach((item, idx) => {

    // checking type to ensure it is not selected already
    if (item.type === null) {

      user_form.append(renderFormUser(item, idx, animation = false));

    }

  });

}

function bringPopover(selector) {

  $(selector).toggleClass("d-none");
  $(form_selector).toggleClass("blur");

}

function updateUserTarget(type) {
  user_selection_type = type;
}

function updateUsers(selector) {

  try {

    let form_data = $(selector).serializeArray();
    
    if (form_data.length == 0) {
      toast("No User Selected", 'Please select at least one user.', 1);
      return false;
    }

    form_data.forEach(o => {

      let found = all_users.find(item => item.sid == o.value);

      if (found) {

        found.type = user_selection_type;

      } else {

        toast("No User Selected", 1);

      }

    })

    updateUserList(all_users);
    bringPopover("#user-selection");

    return false;

  } catch (err) {

    console.error(err);
    return false;

  }


}

function searchUsers(input) {

  let filtered_users = all_users;

  // if input value exists
  if (input.value) {

    filtered_users = all_users.filter(user => {

      // defining what fields to search
      let search_content = user.full_name + user.sid + user.email + user.role;
      let search_text = input.value?.trim()?.toLowerCase();

      return search_content.toLowerCase().includes(search_text);

    });
  }

  updateUserFormList(filtered_users);

}