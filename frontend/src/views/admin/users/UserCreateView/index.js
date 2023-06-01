import React from 'react';
import { Container, makeStyles } from '@material-ui/core';
import Page from 'src/components/Page';
import Header from './Header';
import UserCreateForm from './UserCreateForm';

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.background.dark,
    minHeight: '100%',
    paddingTop: theme.spacing(3),
    paddingBottom: theme.spacing(3)
  }
}));

function UserCreateView() {
  const classes = useStyles();

  return (
    <Page
      className={classes.root}
      title="User Create"
    >
      <Container maxWidth={false}>
        <Header />
        <UserCreateForm />
      </Container>
    </Page>
  );
}

export default UserCreateView;
